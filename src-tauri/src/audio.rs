//! 系统播放声音的频谱采样。
//!
//! Windows 上用 WASAPI 的 loopback：拿默认播放设备的混音数据（就是喇叭里正在响的东西），
//! 每 30 毫秒算一次频段能量，把 28 个 0~1 的数值发给界面驱动频谱动效。
//! 这里只发数值、不发音频，一条通道也就几十个浮点数，开销可以忽略。
//!
//! 其它平台暂时没有对应实现，`available()` 会返回 false，界面上那一项会自己禁用。

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// 频谱柱子的数量。改这里就要同步改前端的占位数（多退少补不影响，只是宽度会变）。
pub const BANDS: usize = 28;

#[derive(Clone, Serialize)]
pub struct Spectrum {
    /// 每个频段的能量，0~1。
    pub bands: Vec<f32>,
    /// 整体响度，0~1，用来做整体光晕。
    pub level: f32,
}

pub const EVENT: &str = "nemu://spectrum";

pub struct Capture {
    stop: Arc<AtomicBool>,
}

impl Capture {
    pub fn stop(&self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

#[derive(Default)]
pub struct AudioState(pub Mutex<Option<Capture>>);

#[cfg(target_os = "windows")]
mod platform {
    use super::{Capture, Spectrum, BANDS, EVENT};
    use std::f32::consts::PI;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::thread;
    use std::time::{Duration, Instant};
    use tauri::{AppHandle, Emitter};
    use windows::core::{GUID, IUnknown};
    use windows::Win32::Media::Audio::{
        eConsole, eRender, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator,
        AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_MULTITHREADED,
    };

    const WAVE_FORMAT_IEEE_FLOAT: u32 = 3;
    const WAVE_FORMAT_EXTENSIBLE: u32 = 0xfffe;
    const AUDCLNT_BUFFERFLAGS_SILENT: u32 = 0x2;
    /// CLSID_MMDeviceEnumerator —— 这个 coclass 没在 windows crate 里导出，直接用它的 GUID。
    const CLSID_MM_DEVICE_ENUMERATOR: GUID = GUID::from_u128(0xbcde0395_e52f_467c_8e3d_c4579291692e);
    /// 降采样到这个采样率再做频段分析，够用又省事。
    const ANALYSIS_RATE: f32 = 8000.0;
    const WINDOW: usize = 1024;
    const EMIT_INTERVAL: Duration = Duration::from_millis(32);

    pub fn available() -> bool {
        true
    }

    pub fn start(handle: AppHandle) -> Result<Capture, String> {
        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = stop.clone();
        // 先把设备打开再返回：权限/设备问题要能马上告诉用户，而不是静默失败。
        let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();
        thread::spawn(move || {
            if let Err(error) = run(thread_stop.clone(), handle, ready_tx) {
                let _ = thread_stop.load(Ordering::Relaxed);
                eprintln!("nemufloat: 音频响应停止：{error}");
            }
        });
        match ready_rx.recv_timeout(Duration::from_secs(3)) {
            Ok(Ok(())) => Ok(Capture { stop }),
            Ok(Err(error)) => Err(error),
            Err(_) => Err("打开音频设备超时".into()),
        }
    }

    fn run(
        stop: Arc<AtomicBool>,
        handle: AppHandle,
        ready: std::sync::mpsc::Sender<Result<(), String>>,
    ) -> Result<(), String> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(
                &CLSID_MM_DEVICE_ENUMERATOR,
                None::<&IUnknown>,
                CLSCTX_ALL,
            )
            .map_err(|error| format!("拿不到音频设备枚举器：{error}"))?;
            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, eConsole)
                .map_err(|error| format!("拿不到默认播放设备：{error}"))?;
            let client: IAudioClient = device
                .Activate(CLSCTX_ALL, None)
                .map_err(|error| format!("打开音频客户端失败：{error}"))?;

            let format = client.GetMixFormat().map_err(|error| error.to_string())?;
            let channels = (*format).nChannels.max(1) as usize;
            let sample_rate = (*format).nSamplesPerSec.max(1) as usize;
            let bits = (*format).wBitsPerSample as usize;
            let tag = (*format).wFormatTag as u32;
            let is_float = tag == WAVE_FORMAT_IEEE_FLOAT
                || (tag == WAVE_FORMAT_EXTENSIBLE && bits == 32);
            let ok = (is_float && bits == 32) || bits == 16 || bits == 32;
            if !ok {
                CoTaskMemFree(Some(format as *const _));
                return Err(format!("不认识的音频格式（{bits} 位）"));
            }

            let init = client.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK,
                200_000,
                0,
                format,
                None,
            );
            CoTaskMemFree(Some(format as *const _));
            init.map_err(|error| format!("初始化回环捕获失败：{error}"))?;

            let capture: IAudioCaptureClient = client
                .GetService()
                .map_err(|error| format!("拿不到采集接口：{error}"))?;
            client.Start().map_err(|error| format!("启动捕获失败：{error}"))?;

            let decim = ((sample_rate as f32 / ANALYSIS_RATE).round() as usize).max(1);
            let mut window = vec![0f32; WINDOW];
            let mut write = 0usize;
            let mut since_window = 0usize;
            let mut last_emit = Instant::now();
            let mut smoothed = vec![0f32; BANDS];
            let mut level = 0f32;
            let mut ready = Some(ready);

            while !stop.load(Ordering::Relaxed) {
                let mut packet = capture.GetNextPacketSize().unwrap_or(0);
                if packet == 0 {
                    thread::sleep(Duration::from_millis(6));
                    continue;
                }
                while packet > 0 {
                    let mut data: *mut u8 = std::ptr::null_mut();
                    let mut frames = 0u32;
                    let mut flags = 0u32;
                    if capture
                        .GetBuffer(&mut data, &mut frames, &mut flags, None, None)
                        .is_err()
                    {
                        break;
                    }
                    if flags & AUDCLNT_BUFFERFLAGS_SILENT == 0 && !data.is_null() {
                        let frame_bytes = channels * bits / 8;
                        for frame in 0..frames as usize {
                            let base = data.add(frame * frame_bytes);
                            let mut sum = 0f32;
                            for channel in 0..channels {
                                let at = base.add(channel * bits / 8);
                                sum += if is_float {
                                    std::ptr::read_unaligned(at as *const f32)
                                } else if bits == 16 {
                                    std::ptr::read_unaligned(at as *const i16) as f32 / 32768.0
                                } else {
                                    std::ptr::read_unaligned(at as *const i32) as f32 / 2147483648.0
                                };
                            }
                            let mono = sum / channels as f32;
                            since_window += 1;
                            if since_window >= decim {
                                since_window = 0;
                                window[write] = mono;
                                write = (write + 1) % WINDOW;
                            }
                        }
                    }
                    let _ = capture.ReleaseBuffer(frames);
                    packet = capture.GetNextPacketSize().unwrap_or(0);
                }

                if last_emit.elapsed() < EMIT_INTERVAL {
                    continue;
                }
                last_emit = Instant::now();

                // 环形缓冲按时间顺序整理成一段连续窗口（旧的在前）。
                let mut ordered = Vec::with_capacity(WINDOW);
                ordered.extend_from_slice(&window[write..]);
                ordered.extend_from_slice(&window[..write]);

                let mut sum_sq = 0f32;
                for value in &ordered {
                    sum_sq += value * value;
                }
                let rms = (sum_sq / ordered.len() as f32).sqrt();
                let target_level = ((20.0 * (rms + 1e-6).log10() + 60.0) / 60.0).clamp(0.0, 1.0);
                level += (target_level - level) * if target_level > level { 0.55 } else { 0.12 };

                for index in 0..BANDS {
                    let ratio = index as f32 / (BANDS - 1) as f32;
                    // 60Hz~3.5kHz 之间按对数取中心频率，低频多给点柱子。
                    let freq = 60.0 * (3500.0f32 / 60.0).powf(ratio);
                    let magnitude = goertzel(&ordered, freq, ANALYSIS_RATE);
                    let db = 20.0 * (magnitude + 1e-7).log10();
                    let value = ((db + 72.0) / 72.0).clamp(0.0, 1.0);
                    // 涨得快、落得慢，看起来才不像噪声。
                    let previous = smoothed[index];
                    smoothed[index] += (value - previous) * if value > previous { 0.6 } else { 0.14 };
                }

                let _ = handle.emit(
                    EVENT,
                    Spectrum {
                        bands: smoothed.clone(),
                        level,
                    },
                );

                if let Some(sender) = ready.take() {
                    let _ = sender.send(Ok(()));
                }
            }

            let _ = client.Stop();
            Ok(())
        }
    }

    /// 单点频率的能量（Goertzel）。比做整段 FFT 省事，柱子够用。
    fn goertzel(samples: &[f32], freq: f32, sample_rate: f32) -> f32 {
        let n = samples.len() as f32;
        let k = (0.5 + n * freq / sample_rate).floor();
        let omega = 2.0 * PI * k / n;
        let coeff = 2.0 * omega.cos();
        let mut s1 = 0f32;
        let mut s2 = 0f32;
        for &sample in samples {
            let s0 = sample + coeff * s1 - s2;
            s2 = s1;
            s1 = s0;
        }
        let real = s1 - s2 * omega.cos();
        let imag = s2 * omega.sin();
        (real * real + imag * imag).sqrt() / n
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    use super::Capture;
    use tauri::AppHandle;

    pub fn available() -> bool {
        false
    }

    pub fn start(_handle: AppHandle) -> Result<Capture, String> {
        Err("音频响应目前只在 Windows 上可用".into())
    }
}

pub use platform::{available, start};
