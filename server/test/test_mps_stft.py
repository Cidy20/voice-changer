import torch
import os
os.environ['PYTORCH_ENABLE_MPS_FALLBACK'] = '0'

device = torch.device('mps')
x = torch.randn(1, 1024, device=device)
window = torch.hann_window(1024, device=device)

try:
    with torch.no_grad():
        stft_res = torch.stft(x, n_fft=1024, hop_length=256, win_length=1024, window=window, return_complex=True)
    print("STFT ALONE PASSED")
except Exception as e:
    print("STFT FAILED:", e)

try:
    with torch.no_grad():
        from voice_changer.common.rmvpe.rmvpe import RMVPE
        print("RMVPE imported")
except Exception as e:
    print("IMPORT ERROR:", e)

