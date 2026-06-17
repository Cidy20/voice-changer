import { JSX, useState, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faFilter } from '@fortawesome/free-solid-svg-icons';
import { getAvailableEffectTypesFromServer } from './serverEffectsUtils';

export type AudioChannel = 'input' | 'output';
import { CSS_CLASSES } from '../../styles/constants';
import GenericModal from '../Modals/GenericModal';
import { useTranslation } from 'react-i18next';

interface AddEffectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddEffect: (effectType: string, channel: AudioChannel) => void;
  channel: AudioChannel;
  serverSchema?: any;
  providersInfo?: any;
}

function AddEffectModal({ 
  isOpen, 
  onClose, 
  onAddEffect, 
  channel, 
  serverSchema,
  providersInfo 
}: AddEffectModalProps): JSX.Element {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('all');

  // Get available effects and providers
  const availableEffects = useMemo(() => 
    getAvailableEffectTypesFromServer(serverSchema), 
    [serverSchema]
  );

  const providers = useMemo(() => {
    if (providersInfo?.providers) {
      return providersInfo.providers.filter((p: any) => p.available);
    }
    return [];
  }, [providersInfo]);

  // Filter effects based on search term and selected provider
  const filteredEffects = useMemo(() => {
    return availableEffects.filter(effect => {
      const matchesSearch = !searchTerm || 
        effect.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        effect.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        effect.type.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesProvider = selectedProvider === 'all' || 
        effect.provider === selectedProvider;

      return matchesSearch && matchesProvider;
    });
  }, [availableEffects, searchTerm, selectedProvider]);

  // Group effects by provider for better organization
  const effectsByProvider = useMemo(() => {
    const grouped: Record<string, typeof filteredEffects> = {};
    filteredEffects.forEach(effect => {
      const provider = effect.provider || 'unknown';
      if (!grouped[provider]) {
        grouped[provider] = [];
      }
      grouped[provider].push(effect);
    });
    return grouped;
  }, [filteredEffects]);

  const handleAddEffect = (effectType: string) => {
    onAddEffect(effectType, channel);
    onClose();
    setSearchTerm('');
    setSelectedProvider('all');
  };

  const handleClose = () => {
    onClose();
    setSearchTerm('');
    setSelectedProvider('all');
  };

  return (
    <GenericModal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('audioEffects.addAudioEffect')}
      size="large"
      secondaryButton={{
        text: t('audioEffects.cancel'),
        onClick: handleClose
      }}
    >
      <div className="space-y-4">
        {/* Subtitle */}
        <p className="text-sm text-slate-500 dark:text-gray-400">
          {t('audioEffects.chooseEffectPrompt', { channel: t(`audioEffects.${channel}`) })}
        </p>

        {/* Search and Filter */}
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <FontAwesomeIcon 
              icon={faSearch} 
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 dark:text-gray-500 h-4 w-4" 
            />
            <input
              type="text"
              placeholder={t('audioEffects.searchEffectsPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`${CSS_CLASSES.input} pl-10`}
            />
          </div>

          {/* Provider Filter */}
          <div className="flex items-center space-x-3">
            <FontAwesomeIcon 
              icon={faFilter} 
              className="text-slate-400 dark:text-gray-500 h-4 w-4" 
            />
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className={`${CSS_CLASSES.select} flex-1`}
            >
              <option value="all">{t('audioEffects.allProviders', { count: availableEffects.length })}</option>
              {providers.map((provider: any) => {
                const providerEffects = availableEffects.filter(effect => effect.provider === provider.name);
                return (
                  <option key={provider.name} value={provider.name}>
                    {provider.name} ({t('audioEffects.effectsCount', { count: providerEffects.length })})
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Effects List */}
        <div className="max-h-96 overflow-y-auto">
          {filteredEffects.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-gray-400">
              <p>{t('audioEffects.noEffectsFound')}</p>
              {searchTerm && (
                <p className="text-sm mt-2">{t('audioEffects.adjustSearchTerms')}</p>
              )}
            </div>
          ) : selectedProvider === 'all' ? (
            // Group by provider when showing all
            <div className="space-y-6">
              {Object.entries(effectsByProvider).map(([provider, effects]) => (
                <div key={provider} className="space-y-3">
                  <h4 className="font-medium text-slate-600 dark:text-gray-300 text-sm uppercase tracking-wider">
                    {provider} ({t('audioEffects.effectsCount', { count: effects.length })})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {effects.map((effect) => (
                      <EffectCard 
                        key={effect.type}
                        effect={effect}
                        onAdd={() => handleAddEffect(effect.type)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Single provider view
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredEffects.map((effect) => (
                <EffectCard 
                  key={effect.type}
                  effect={effect}
                  onAdd={() => handleAddEffect(effect.type)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="text-sm text-slate-500 dark:text-gray-400 text-center pt-3 border-t border-slate-200 dark:border-gray-600">
          {t('audioEffects.effectsShownCount', { shown: filteredEffects.length, total: availableEffects.length })}
        </div>
      </div>
    </GenericModal>
  );
}

interface EffectCardProps {
  effect: {
    type: string;
    name: string;
    description: string;
    provider?: string;
  };
  onAdd: () => void;
}

function EffectCard({ effect, onAdd }: EffectCardProps): JSX.Element {
  const { t } = useTranslation();
  const effectKey = effect.type;
  const translatedName = t(`effectsDefinition.${effectKey}.name`, { defaultValue: effect.name });
  const translatedDesc = t(`effectsDefinition.${effectKey}.description`, { defaultValue: effect.description });

  return (
    <button
      onClick={onAdd}
      className="p-4 border border-slate-200 dark:border-gray-600 rounded-lg hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-left group"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h5 className="font-medium text-slate-700 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {translatedName}
          </h5>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-1 break-words">
            {translatedDesc}
          </p>
          {effect.provider && (
            <span className="inline-block mt-2 px-2 py-1 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 rounded text-xs">
              {effect.provider}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default AddEffectModal;