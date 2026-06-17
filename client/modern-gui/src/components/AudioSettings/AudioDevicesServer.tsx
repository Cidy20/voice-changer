import React, { useEffect, useMemo } from 'react';
import { CSS_CLASSES } from '../../styles/constants';
import { useAppState } from '../../context/AppContext';
import { useState } from 'react';
import { useUIContext } from '../../context/UIContext';
import { useTranslation } from 'react-i18next';
import { ServerInfo } from '@dannadori/voice-changer-client-js';

export interface ExtendedServerAudioDevice {
  name: string;
  index: number;
  hostAPI?: string;
  maxInputChannels?: number;
  maxOutputChannels?: number;
}

export interface ExtendedServerInfo extends Omit<ServerInfo, 'serverAudioInputDevices' | 'serverAudioOutputDevices'> {
  asioInputChannel?: number;
  asioOutputChannel?: number;
  serverAudioInputDevices?: ExtendedServerAudioDevice[];
  serverAudioOutputDevices?: ExtendedServerAudioDevice[];
}

function AudioDevicesServer() {
  const { t } = useTranslation();
  // ---------------- States ----------------
  const appState = useAppState();
  const uiState = useUIContext();

  const sampleRates = [16000, 32000, 44100, 48000, 96000, 192000];

  const [availableAudioDrivers, setAvailableAudioDrivers] = useState<string[]>([]);
  const [selectedAudioDriver, setSelectedAudioDriver] = useState<string>('');

  const [selectedMonitorAudioDriver, setSelectedMonitorAudioDriver] = useState<string>('');

  // ---------------- Hooks ----------------

  // Get Server Input Devices based on selected Audio Driver
  const serverInputDevices = useMemo(() => {
    const serverSetting = appState.serverSetting?.serverSetting as ExtendedServerInfo;
    const devices = serverSetting?.serverAudioInputDevices || [];
    return (devices as ExtendedServerAudioDevice[])
      .filter(device => device.hostAPI === selectedAudioDriver);
  }, [appState.serverSetting, selectedAudioDriver]);

  // Get Server Output Devices based on selected Audio Driver
  const serverOutputDevices = useMemo(() => {
    const serverSetting = appState.serverSetting?.serverSetting as ExtendedServerInfo;
    const devices = serverSetting?.serverAudioOutputDevices || [];
    return (devices as ExtendedServerAudioDevice[])
      .filter(device => device.hostAPI === selectedAudioDriver);
  }, [appState.serverSetting, selectedAudioDriver]);

  // Get Server Monitor Devices based on selected Monitor Audio Driver
  const serverMonitorDevices = useMemo(() => {
    if (!selectedMonitorAudioDriver) return [];
    const serverSetting = appState.serverSetting?.serverSetting as ExtendedServerInfo;
    const devices = serverSetting?.serverAudioOutputDevices || [];
    return (devices as ExtendedServerAudioDevice[])
      .filter(device => device.hostAPI === selectedMonitorAudioDriver);
  }, [appState.serverSetting, selectedMonitorAudioDriver]);

  // Set selected monitor audio driver based on selected audio driver
  useEffect(() => {
    const serverSetting = appState.serverSetting?.serverSetting as ExtendedServerInfo;
    const devices = serverSetting?.serverAudioOutputDevices || [];
    if (availableAudioDrivers.length > 0) {
      const monitor = devices.find(x => x.index === serverSetting?.serverMonitorDeviceId);
      setSelectedMonitorAudioDriver(availableAudioDrivers.find(x => x === monitor?.hostAPI) || availableAudioDrivers[0]);
    }
  }, [availableAudioDrivers]);

  // Fetch server devices
  useEffect(() => {
    fetchServerDevices();
  }, [appState.serverSetting.serverSetting.enableServerAudio]);

  // ---------------- Handlers ----------------

  // Handle Sample Rate Change
  const handleSampleRateChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const rate = parseInt(event.target.value);
    appState.serverSetting.updateServerSettings({
      ...appState.serverSetting.serverSetting,
      serverAudioSampleRate: rate,
      serverInputAudioSampleRate: rate,
      serverOutputAudioSampleRate: rate,
      serverMonitorAudioSampleRate: rate
    });
  };

  // Handle Audio Driver Change
  const handleAudioDriverChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    if (appState.serverSetting.serverSetting.serverAudioStated === 1) {
      uiState.setIsConverting(false);
      appState.serverSetting.updateServerSettings({
        ...appState.serverSetting.serverSetting,
        serverAudioStated: 0
      });
    }
    setSelectedAudioDriver(event.target.value);
  };

  // Handle Input Device Change
  const handleInputDeviceChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    appState.serverSetting.updateServerSettings({
      ...appState.serverSetting.serverSetting,
      serverInputDeviceId: parseInt(event.target.value)
    });
  };

  // Handle Output Device Change
  const handleOutputDeviceChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    appState.serverSetting.updateServerSettings({
      ...appState.serverSetting.serverSetting,
      serverOutputDeviceId: parseInt(event.target.value)
    });
  };

  // Handle Monitor Device Change
  const handleMonitorDeviceChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    appState.serverSetting.updateServerSettings({
      ...appState.serverSetting.serverSetting,
      serverMonitorDeviceId: parseInt(event.target.value)
    });
  };

  // Handle Input Channel Change
  const handleInputChannelChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    appState.serverSetting.updateServerSettings({
      ...appState.serverSetting.serverSetting,
      asioInputChannel: parseInt(event.target.value)
    } as any);
  };

  // Handle Output Channel Change
  const handleOutputChannelChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    appState.serverSetting.updateServerSettings({
      ...appState.serverSetting.serverSetting,
      asioOutputChannel: parseInt(event.target.value)
    } as any);
  };

  // Handle Monitor Audio Driver Change
  const handleMonitorAudioDriverChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newDriver = event.target.value;
    setSelectedMonitorAudioDriver(newDriver);
  };

  // ---------------- Methods ----------------

  // Method to fetch server devices
  const fetchServerDevices = async () => {
    try {
      const serverSettings = appState.serverSetting.serverSetting as ExtendedServerInfo;
      const inputs: ExtendedServerAudioDevice[] = serverSettings.serverAudioInputDevices || [];
      const outputs: ExtendedServerAudioDevice[] = serverSettings.serverAudioOutputDevices || [];

      // Extract unique hostAPIs for Audio Driver dropdown
      const hostApis = new Set<string>();
      inputs.forEach(device => device.hostAPI && hostApis.add(device.hostAPI));
      outputs.forEach(device => device.hostAPI && hostApis.add(device.hostAPI));
      const uniqueHostApis = Array.from(hostApis);
      setAvailableAudioDrivers(uniqueHostApis);

      // Set selected audio driver based on server input device
      if (uniqueHostApis.length > 0) {
        const input = inputs.find(x => x.index === serverSetting.serverInputDeviceId);
        setSelectedAudioDriver(uniqueHostApis.find(x => x === input?.hostAPI) || uniqueHostApis[0]);
      }
    } catch (err) {
      console.error('Error fetching server devices:', err);
    }
  };

  // ---------------- Render ----------------

  const serverSetting = appState.serverSetting.serverSetting as ExtendedServerInfo;

  return (
    <>
      <div>
        <label htmlFor="sampleRate" className={CSS_CLASSES.label}>{t('audioSettings.sampleRateLabel')}</label>
        <select id="sampleRate" className={CSS_CLASSES.select} value={serverSetting?.serverInputAudioSampleRate} onChange={handleSampleRateChange}>
          {sampleRates.map(rate => (
            <option key={rate} value={rate}>{rate} Hz</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="audioDriver" className={CSS_CLASSES.label}>{t('audioSettings.audioDriverLabel')}</label>
        <select
          id="audioDriver"
          className={CSS_CLASSES.select}
          value={selectedAudioDriver}
          onChange={handleAudioDriverChange}
        >
          {availableAudioDrivers.length === 0 ? (
            <option value="">{t('audioSettings.noDriversAvailable')}</option>
          ) : (
            availableAudioDrivers.map(driver => (
              <option key={driver} value={driver}>{driver}</option>
            ))
          )}
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex items-end gap-2">
          <div className={selectedAudioDriver === 'ASIO' ? 'w-[70%]' : 'w-full'}>
            <label htmlFor="inputCh" className={CSS_CLASSES.label}>
              {t('audioSettings.inputDeviceLabel')}
            </label>
            <select
              id="inputCh"
              className={`${CSS_CLASSES.select} w-full`}
              value={serverSetting.serverInputDeviceId}
              onChange={handleInputDeviceChange}
            >
              {
                serverInputDevices.length === 0 ? (
                  <option value={-1}>{t('audioSettings.noInputDevicesFound')}</option>
                ) : (
                  <>
                    {
                      !serverInputDevices.find(device => device.index === serverSetting.serverInputDeviceId) && (
                        <option value={-1}>{t('audioSettings.noDeviceSelected')}</option>
                      )
                    }
                    {
                      serverInputDevices.map((device) => (
                        <option
                          key={device.index}
                          value={device.index}
                        >
                          {`[${device.hostAPI}] ${device.name}`}
                        </option>
                      ))
                    }
                  </>
                )
              }
            </select>
          </div>

          {/* Input Channel (only visible when ASIO is selected) - 30% width */}
          {selectedAudioDriver === 'ASIO' && serverInputDevices.find(device => device.index === serverSetting.serverInputDeviceId) && (
            <div className="w-[30%]">
              <label htmlFor="inputChannel" className={CSS_CLASSES.label}>
                {t('audioSettings.channelLabel')}
              </label>
              <select
                id="inputChannel"
                className={`${CSS_CLASSES.select} w-full`}
                value={serverSetting.asioInputChannel}
                onChange={handleInputChannelChange}
              >
                <option value={-1}>{t('audioSettings.defaultChannel')}</option>
                {
                  Array.from({
                    length: serverInputDevices.find(device => device.index === serverSetting.serverInputDeviceId)?.maxInputChannels || 0
                  },
                    (_, index) => (
                      <option key={index} value={index}>{index}</option>
                    )
                  )
                }
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-end gap-2">
          {/* Output Device - 70% width */}
          <div className={selectedAudioDriver === 'ASIO' ? 'w-[70%]' : 'w-full'}>
            <label htmlFor="outputCh" className={CSS_CLASSES.label}>
              {t('audioSettings.outputDeviceLabel')}
            </label>
            <select
              id="outputCh"
              className={`${CSS_CLASSES.select} w-full`}
              value={serverSetting.serverOutputDeviceId}
              onChange={handleOutputDeviceChange}
            >
              {
                serverOutputDevices.length === 0 ? (
                  <option value={-1}>{t('audioSettings.noOutputDevicesFound')}</option>
                ) : (
                  <>
                    {
                      !serverOutputDevices.find(device => device.index === serverSetting.serverOutputDeviceId) && (
                        <option value={-1}>{t('audioSettings.noDeviceSelected')}</option>
                      )
                    }
                    {
                      serverOutputDevices.map((device) => (
                        <option
                          key={device.index}
                          value={device.index}
                        >
                          {`[${device.hostAPI}] ${device.name}`}
                        </option>
                      ))
                    }
                  </>
                )
              }
            </select>
          </div>

          {/* Output Channel (only visible when ASIO is selected) - 30% width */}
          {selectedAudioDriver === 'ASIO' && serverOutputDevices.find(device => device.index === serverSetting.serverOutputDeviceId) && (
            <div className="w-[30%]">
              <label htmlFor="outputChannel" className={CSS_CLASSES.label}>
                {t('audioSettings.channelLabel')}
              </label>
              <select
                id="outputChannel"
                className={`${CSS_CLASSES.select} w-full`}
                value={serverSetting.asioOutputChannel}
                onChange={handleOutputChannelChange}
              >
                <option value={-1}>{t('audioSettings.defaultChannel')}</option>
                {
                  Array.from({
                    length: serverOutputDevices.find(device => device.index === serverSetting.serverOutputDeviceId)?.maxOutputChannels || 0
                  },
                    (_, index) => (
                      <option key={index} value={index}>{index}</option>
                    )
                  )
                }
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Monitor Device & Driver */}
      <div className="flex items-end gap-2">
        {/* Monitor Audio Driver Selector - 30% width */}
        <div className="w-[30%]">
          <label htmlFor="monitorAudioDriver" className={CSS_CLASSES.label}>
            {t('audioSettings.monitorDriverLabel')}
          </label>
          <select
            id="monitorAudioDriver"
            className={`${CSS_CLASSES.select} w-full`}
            value={selectedMonitorAudioDriver}
            onChange={handleMonitorAudioDriverChange}
          >
            {availableAudioDrivers.length === 0 ? (
              <option value="">{t('audioSettings.noDriversAvailable')}</option>
            ) : (
              availableAudioDrivers.map(driver => (
                <option key={driver} value={driver}>{driver}</option>
              ))
            )}
          </select>
        </div>

        {/* Monitor Device Selector - 70% width */}
        <div className="w-[70%]">
          <label htmlFor="monCh" className={CSS_CLASSES.label}>
            {t('audioSettings.monitorDeviceLabel')}
          </label>
          <select
            id="monCh"
            className={`${CSS_CLASSES.select} w-full`}
            value={appState.serverSetting.serverSetting.serverMonitorDeviceId}
            onChange={handleMonitorDeviceChange}
            disabled={!selectedMonitorAudioDriver || serverMonitorDevices.length === 0}
          >
            {
              serverMonitorDevices.length === 0 ? (
                <option value={-1}>{t('audioSettings.noDevicesForDriver')}</option>
              ) : (
                <>
                  <option value={-1}>{t('audioSettings.noDeviceSelected')}</option>
                  {
                    serverMonitorDevices.map((device) => (
                      <option
                        key={device.index}
                        value={device.index}
                      >
                        {`[${device.hostAPI}] ${device.name}`}
                      </option>
                    ))
                  }
                </>
              )
            }
          </select>
        </div>
      </div>
    </>
  );
}

export default AudioDevicesServer;