
import { JSX, useState, useEffect } from 'react';
import { useAppState } from '../../../../context/AppContext';
import { useUIContext } from '../../../../context/UIContext';
import DebouncedSlider from '../../../Helpers/DebouncedSlider';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { Protocol, ServerInfo } from '@dannadori/voice-changer-client-js';
import { CSS_CLASSES } from '../../../../styles/constants';
import { useTranslation } from 'react-i18next';

export interface ExtendedServerInfo extends ServerInfo {
  forceFp32?: number;
  disableJit?: number;
  useONNX?: number;
}

function SettingsView(): JSX.Element {
  const { t } = useTranslation();
  // ---------------- States ----------------
  const appState = useAppState();
  const uiState = useUIContext();

  const serverSetting = appState.serverSetting?.serverSetting as ExtendedServerInfo;

  const [localCrossFadeOverlapSize, setLocalCrossFadeOverlapSize] = useState<number>(
    serverSetting?.crossFadeOverlapSize ?? 0.02
  );
  const [localProtect, setLocalProtect] = useState<number>(
    serverSetting?.protect ?? 0
  );

  // ---------------- Hooks ----------------

  // Update local state when server settings change
  useEffect(() => {
    const currentSettings = appState.serverSetting?.serverSetting as ExtendedServerInfo;
    const crossFade = currentSettings?.crossFadeOverlapSize;
    if (crossFade != null) setLocalCrossFadeOverlapSize(crossFade);

    const protect = currentSettings?.protect;
    if (protect != null) setLocalProtect(protect);
  }, [appState.serverSetting?.serverSetting]);

  // ---------------- Handlers ----------------

  // Handle cross fade overlap size change
  const handleCrossFadeOverlapSizeChange = async (val: number) => {
    await appState.serverSetting.updateServerSettings({
      ...appState.serverSetting.serverSetting,
      crossFadeOverlapSize: val as any
    } as any);
    setLocalCrossFadeOverlapSize(val);
  };

  // Handle silence front change
  const handleSilenceFrontChange = async (val: boolean) => {
    const value = val ? 1 : 0;
    uiState.startLoading(value === 1 ? t('advancedSettings.enablingSilenceFront') : t('advancedSettings.disablingSilenceFront'));
    await appState.serverSetting.updateServerSettings({ ...appState.serverSetting.serverSetting, silenceFront: value } as any);
    uiState.stopLoading();
  };

  // Handle force fp32 change
  const handleForceFp32Change = async (val: boolean) => {
    const value = val ? 1 : 0;
    uiState.startLoading(value === 1 ? t('advancedSettings.enablingForceFp32') : t('advancedSettings.disablingForceFp32'));
    await appState.serverSetting.updateServerSettings({ ...appState.serverSetting.serverSetting, forceFp32: value } as any);
    uiState.stopLoading();
  };

  // Handle disable jit change
  const handleDisableJitChange = async (val: boolean) => {
    const value = val ? 1 : 0;
    uiState.startLoading(value === 1 ? t('advancedSettings.disablingJit') : t('advancedSettings.enablingJit'));
    await appState.serverSetting.updateServerSettings({ ...appState.serverSetting.serverSetting, disableJit: value } as any);
    uiState.stopLoading();
  };

  // Handle use onnx change
  const handleUseONNXChange = async (val: boolean) => {
    const value = val ? 1 : 0;
    uiState.startLoading(value === 1 ? t('advancedSettings.enablingOnnx') : t('advancedSettings.disablingOnnx'));
    await appState.serverSetting.updateServerSettings({ ...appState.serverSetting.serverSetting, useONNX: value } as any);
    uiState.stopLoading();
  };

  // Handle protect change
  const handleProtectChange = async (val: number) => {
    await appState.serverSetting.updateServerSettings({
      ...appState.serverSetting.serverSetting,
      protect: val
    } as any);
    setLocalProtect(val);
  };

  const handlePassThroughConfirmationSkipChange = async (val: boolean) => {
    appState.setVoiceChangerClientSetting({ ...appState.setting.voiceChangerClientSetting, passThroughConfirmationSkip: val });
  };

  // ---------------- Render ----------------

  return (
    <div className="space-y-4 py-2">
      <div>
        <label htmlFor="protocol" className={CSS_CLASSES.label}>{t('advancedSettings.protocolLabel')}</label>
        <select id="protocol" className={CSS_CLASSES.select}
          value={appState.setting.workletNodeSetting.protocol}
          onChange={e => appState.setWorkletNodeSetting({ ...appState.setting.workletNodeSetting, protocol: e.target.value as Protocol })}
        >
          <option value="sio">sio</option>
          <option value="rest">rest</option>
        </select>
      </div>
      <div>
        <label htmlFor="crossfade" className={CSS_CLASSES.label}>{t('advancedSettings.crossfadeOverlapLabel')}</label>
        <DebouncedSlider id="crossfade" name="crossfade"
          min={0.05} max={0.2} step={0.01}
          value={localCrossFadeOverlapSize}
          className={CSS_CLASSES.range}
          onImmediateChange={setLocalCrossFadeOverlapSize}
          onChange={async val => { handleCrossFadeOverlapSizeChange(val); }}
        />
        <p className="text-xs text-slate-600 dark:text-gray-400 text-right">{localCrossFadeOverlapSize.toFixed(2)} s</p>
      </div>
      <div>
        <label className={CSS_CLASSES.checkboxLabel}>
          <input type="checkbox" className="mr-2 accent-blue-500 dark:accent-blue-400"
            checked={serverSetting.silenceFront === 1}
            onChange={async e => { handleSilenceFrontChange(e.target.checked) }}
          />
          {t('advancedSettings.silenceFrontLabel')}
        </label>
      </div>
      <div>
        <label className={CSS_CLASSES.checkboxLabel}>
          <input type="checkbox" className="mr-2 accent-blue-500 dark:accent-blue-400"
            checked={serverSetting.forceFp32 === 1}
            onChange={async e => { handleForceFp32Change(e.target.checked) }}
          />
          {t('advancedSettings.forceFp32Label')}
        </label>
      </div>
      <div>
        <label className={CSS_CLASSES.checkboxLabel}>
          <input type="checkbox" className="mr-2 accent-blue-500 dark:accent-blue-400"
            checked={serverSetting.disableJit === 1}
            onChange={async e => { handleDisableJitChange(e.target.checked) }}
          />
          {t('advancedSettings.disableJitLabel')}
        </label>
      </div>
      <div>
        <label className={CSS_CLASSES.checkboxLabel}>
          <input type="checkbox" className="mr-2 accent-blue-500 dark:accent-blue-400"
            checked={serverSetting.useONNX === 1}
            onChange={async e => { handleUseONNXChange(e.target.checked) }}
          />
          {t('advancedSettings.convertToOnnxLabel')}
        </label>
      </div>
      <div>
        <label htmlFor="protect" className={CSS_CLASSES.label}>{t('advancedSettings.protectLabel')}</label>
        <DebouncedSlider id="protect" name="protect"
          min={0} max={0.5} step={0.01}
          value={localProtect}
          className={CSS_CLASSES.range}
          onImmediateChange={setLocalProtect}
          onChange={async val => { handleProtectChange(val) }}
        />
        <p className="text-xs text-slate-600 dark:text-gray-400 text-right">{localProtect.toFixed(2)}</p>
      </div>

      <div className="border border-red-500 p-3 rounded bg-red-50 dark:bg-red-900/20 space-y-2">
        <div className="flex items-center text-red-600 mb-2">
          <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2" />
          <span className="font-semibold">{t('advancedSettings.dangerZone')}</span>
        </div>
        <label className={CSS_CLASSES.checkboxLabel}>
          <input type="checkbox" className="mr-2 accent-red-500 dark:accent-red-400"
            checked={appState.setting.voiceChangerClientSetting.passThroughConfirmationSkip}
            onChange={e => handlePassThroughConfirmationSkipChange(e.target.checked)}
          />
          {t('advancedSettings.skipPassThroughConfirmation')}
        </label>
      </div>
    </div>
  );
}

export default SettingsView;
