import torch
from librosa.filters import mel
from typing import Optional

class MelSpectrogram(torch.nn.Module):
    def __init__(
            self,
            is_half: bool,
            n_mel_channels: int,
            sampling_rate: int,
            win_length: int,
            hop_length: int,
            n_fft: Optional[int] = None,
            mel_fmin: int = 0,
            mel_fmax: Optional[int] = None,
            clamp: float = 1e-5,
    ):
        super(MelSpectrogram, self).__init__()
        n_fft = win_length if n_fft is None else n_fft
        mel_basis = mel(
            sr=sampling_rate,
            n_fft=n_fft,
            n_mels=n_mel_channels,
            fmin=mel_fmin,
            fmax=mel_fmax,
            htk=True)
        mel_basis = torch.from_numpy(mel_basis).float()
        self.register_buffer("mel_basis", mel_basis)
        self.n_fft = win_length if n_fft is None else n_fft
        self.hop_length = hop_length
        self.win_length = win_length
        self.sampling_rate = sampling_rate
        self.n_mel_channels = n_mel_channels
        self.clamp = clamp
        self.is_half = is_half
        self.hann_window = torch.hann_window(win_length)

    def forward(self, audio: torch.Tensor) -> torch.Tensor:
        device = audio.device
        use_cpu_stft = device.type == 'privateuseone'
        
        if use_cpu_stft:
            audio_cpu = audio.detach().cpu()
            fft = torch.stft(
                audio_cpu,
                n_fft=self.n_fft,
                hop_length=self.hop_length,
                win_length=self.win_length,
                window=self.hann_window.cpu(),
                center=True,
                return_complex=False,
            )
            magnitude = torch.sqrt(fft[:, :, :, 0].pow(2) + fft[:, :, :, 1].pow(2))
            magnitude = magnitude.to(device)
        else:
            fft = torch.stft(
                audio,
                n_fft=self.n_fft,
                hop_length=self.hop_length,
                win_length=self.win_length,
                window=self.hann_window.to(device),
                center=True,
                return_complex=False,
            )
            magnitude = torch.sqrt(fft[:, :, :, 0].pow(2) + fft[:, :, :, 1].pow(2))
        
        mel_output = torch.matmul(self.mel_basis.to(device), magnitude)
        if self.is_half:
            mel_output = mel_output.half()
        log_mel_spec = torch.log(torch.clamp(mel_output, min=self.clamp))       
        return log_mel_spec