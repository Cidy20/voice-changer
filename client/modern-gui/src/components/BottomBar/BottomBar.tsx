import { JSX, useState, useEffect } from 'react';
import { useThemeContext } from '../../context/ThemeContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSun, faMoon, faPlay, faStop, faVolumeUp, faVolumeMute } from '@fortawesome/free-solid-svg-icons';
import { AppContextValue, useAppState } from '../../context/AppContext';
import { useUIContext } from '../../context/UIContext';
import MergeLabModal from './Modals/Merge/MergeLabModal';
import AdvancedSettingsModal from './Modals/AdvancedSettings/AdvancedSettingsModal';
import ClientInfoModal from './Modals/ClientInfoModal';
import ServerInfoModal from './Modals/ServerInfoModal';
import { CSS_CLASSES } from '../../styles/constants';
import PassthroughConfirmModal from './Modals/PassthroughConfirmModal';

import { useTranslation } from 'react-i18next';

function BottomBar(): JSX.Element {
  const { t, i18n } = useTranslation();
  // ---------------- States ----------------
  const { theme, toggleTheme } = useThemeContext();
  const appState = useAppState() as AppContextValue;
  const uiContext = useUIContext();

  const [showMerge, setShowMerge] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showPassthroughConfirm, setShowPassthroughConfirm] = useState<boolean>(false);
  const [showClientInfo, setShowClientInfo] = useState<boolean>(false);
  const [showServerInfo, setShowServerInfo] = useState<boolean>(false);

  const [startWithAudioContextCreate, setStartWithAudioContextCreate] = useState<boolean>(false);

  // ---------------- Hooks ----------------

  // Set start with audio context create
  useEffect(() => {
    if (!startWithAudioContextCreate) {
      return;
    }
    uiContext.setIsConverting(true);
    appState.start();
  }, [startWithAudioContextCreate]);

  // ---------------- Handlers ----------------

  // Handle toggle audio convert
  const handleToggleClientActivity = async () => {
    if (uiContext.isConverting) {
      handleStop();
    } else {
      handleStart();
    }
  }

  // Handle start convert
  const handleStart = async () => {
    // Check if model is selected
    if (appState.serverSetting.serverSetting.modelSlotIndex === -1) {
      uiContext.showError('Select a voice model first.', "Warning")
      return
    }

    // Client Mode
    if (appState.serverSetting.serverSetting.enableServerAudio == 0) {
      // Check if audio input is selected
      if (!appState.setting.voiceChangerClientSetting.audioInput || appState.setting.voiceChangerClientSetting.audioInput == 'none') {
        uiContext.showError('Select an audio input device.', "Warning")
        return
      }

      // Check if audio output is selected
      if (uiContext.audioOutputForGUI == 'none') {
        uiContext.showError('Select an audio output device.', "Warning")
        return
      }

      // Check if audio context is initialized
      if (!appState.initializedRef.current) {
        while (true) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 500);
          });
          if (appState.initializedRef.current) {
            break;
          }
        }
        setStartWithAudioContextCreate(true);
      }
      // Start client convert
      else {
        uiContext.setIsConverting(true);
        await appState.start();
      }
    }
    // Server Mode
    else {
      // Check if server audio input is selected
      if (!appState.serverSetting.serverSetting.serverAudioInputDevices.find(device => device.index === appState.serverSetting.serverSetting.serverInputDeviceId)) {
        uiContext.showError('Select an audio input device.', "Warning")
        return
      }

      // Check if server audio output is selected
      if (!appState.serverSetting.serverSetting.serverAudioOutputDevices.find(device => device.index === appState.serverSetting.serverSetting.serverOutputDeviceId)) {
        uiContext.showError('Select an audio output device.', "Warning")
        return
      }

      // Start server convert
      appState.serverSetting.updateServerSettings({ ...appState.serverSetting.serverSetting, serverAudioStated: 1 });
      uiContext.setIsConverting(true);
    }
  };

  // Handle stop convert
  const handleStop = async () => {
    if (appState.serverSetting.serverSetting.enableServerAudio == 0) {
      uiContext.setIsConverting(false);
      await appState.stop();
    } else {
      uiContext.setIsConverting(false);
      appState.serverSetting.updateServerSettings({ ...appState.serverSetting.serverSetting, serverAudioStated: 0 });
    }
  };

  // Handle disable pass through
  const disablePassThrough = () => {
    appState.serverSetting.updateServerSettings({ ...appState.serverSetting.serverSetting, passThrough: false });
  }

  // ---------------- Render ----------------

  return (
    <>
      <MergeLabModal
        appState={appState}
        guiState={uiContext}
        showMerge={showMerge}
        setShowMerge={setShowMerge}
      />

      <AdvancedSettingsModal
        showAdvancedSettings={showSettings}
        setShowAdvancedSettings={setShowSettings}
      />

      <PassthroughConfirmModal
        appState={appState}
        showPassthrough={showPassthroughConfirm}
        setShowPassthrough={setShowPassthroughConfirm}
      />

      <ClientInfoModal
        showClientInfo={showClientInfo}
        setShowClientInfo={setShowClientInfo}
      />

      <ServerInfoModal
        showServerInfo={showServerInfo}
        setShowServerInfo={setShowServerInfo}
      />

      <div className="h-20 min-h-[60px] bg-white dark:bg-gray-800 border-t border-slate-200 dark:border-gray-700 flex items-center justify-between px-4 py-2 flex-shrink-0 transition-colors duration-300">
        <div className="flex space-x-2">
          <button onClick={() => setShowMerge(true)} className={CSS_CLASSES.modalSecondaryButton}>{t('bottomBar.mergeLab')}</button>
          <button onClick={() => setShowSettings(true)} className={CSS_CLASSES.modalSecondaryButton}>{t('bottomBar.advancedSettings')}</button>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleToggleClientActivity}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150 flex items-center space-x-2 
            ${uiContext.isConverting
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-green-500 hover:bg-green-600 text-white'}
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 
            ${uiContext.isConverting ? 'focus:ring-red-400' : 'focus:ring-green-400'}`}
          >
            <FontAwesomeIcon icon={uiContext.isConverting ? faStop : faPlay} />
            <span>{uiContext.isConverting ? t('bottomBar.stopServer') : t('bottomBar.startServer')}</span>
          </button>
          <button
            onClick={appState.serverSetting?.serverSetting?.passThrough ? disablePassThrough : () => setShowPassthroughConfirm(true)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150 flex items-center space-x-2 
            ${appState.serverSetting?.serverSetting?.passThrough
                ? 'bg-yellow-500 hover:bg-yellow-600 text-gray-900'
                : 'bg-gray-600 hover:bg-gray-500 text-white'}
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 
            ${appState.serverSetting?.serverSetting?.passThrough ? 'focus:ring-yellow-400' : 'focus:ring-gray-400'}`}
          >
            <FontAwesomeIcon icon={appState.serverSetting?.serverSetting?.passThrough ? faVolumeUp : faVolumeMute} />
            <span>{appState.serverSetting?.serverSetting?.passThrough ? t('bottomBar.passthroughOn') : t('bottomBar.passthroughOff')}</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button onClick={() => setShowServerInfo(true)} className={CSS_CLASSES.modalSecondaryButton}>{t('bottomBar.serverInfo')}</button>
          <button onClick={() => setShowClientInfo(true)} className={CSS_CLASSES.modalSecondaryButton}>{t('bottomBar.clientInfo')}</button>
          
          <select
            value={(i18n && i18n.language && typeof i18n.language === 'string' && i18n.language.startsWith('zh')) ? 'zh' : 'en'}
            onChange={(e) => i18n && i18n.changeLanguage && i18n.changeLanguage(e.target.value)}
            className="bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 border border-slate-200 dark:border-gray-700 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors duration-200 cursor-pointer h-9 hover:border-slate-300 dark:hover:border-gray-600"
          >
            <option value="en">English</option>
            <option value="zh">简体中文</option>
          </select>

          <button
            onClick={toggleTheme}
            className={CSS_CLASSES.modalSecondaryButton}
            aria-label={theme === 'light' ? "Switch to dark mode" : "Switch to light mode"}
          >
            <FontAwesomeIcon icon={theme === 'light' ? faMoon : faSun} className="h-5 w-5" />
          </button>
        </div>
      </div>
    </>
  );
}

export default BottomBar; 