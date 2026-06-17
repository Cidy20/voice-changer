import { JSX, useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faQuestionCircle } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { CSS_CLASSES } from '../../styles/constants';
import DebouncedSlider from '../Helpers/DebouncedSlider';
import { getEffectDefinition } from './serverEffectsUtils';

export interface AudioEffect {
  type: string;
  channel: 'input' | 'output';
  enabled: boolean;
  parameters: Record<string, number | boolean | string>;
}

export interface AudioEffectParameterDefinition {
  name: string;
  type: 'slider' | 'toggle' | 'select';
  defaultValue: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  description?: string;
  options?: string[];
}

// UI type with index for client-side management
type AudioEffectWithIndex = AudioEffect & { index: number };

interface EffectConfigProps {
  effect: AudioEffectWithIndex | null;
  onParameterChange: (effectIndex: number, parameterId: string, value: number | boolean | string) => void;
  serverSchema?: any;
}

interface SliderParameterProps {
  effectType: string;
  paramKey: string;
  definition: AudioEffectParameterDefinition;
  value: number;
  onChange: (value: number) => void;
}

function SliderParameter({ effectType, paramKey, definition, value, onChange }: SliderParameterProps) {
  const { t } = useTranslation();
  const [displayValue, setDisplayValue] = useState(value);
  
  // Update display value when parameter value changes from server
  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  const translatedName = t(`effectsDefinition.${effectType}.parameters.${paramKey}.name`, { defaultValue: definition.name });
  const translatedDesc = t(`effectsDefinition.${effectType}.parameters.${paramKey}.description`, { defaultValue: definition.description });
  const labelText = translatedDesc ? `${translatedName} (${translatedDesc})` : translatedName;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1">
          <label className={CSS_CLASSES.label}>
            {labelText}
          </label>
        </div>
        <span className={CSS_CLASSES.sliderValue}>
          {displayValue.toFixed(definition.step && definition.step < 1 ? 2 : 0)}
          {definition.unit && ` ${definition.unit}`}
        </span>
      </div>
      <DebouncedSlider
        min={definition.min || 0}
        max={definition.max || 1}
        step={definition.step || 0.01}
        value={value}
        onChange={onChange}
        onImmediateChange={setDisplayValue}
        className={CSS_CLASSES.range}
      />
    </div>
  );
}

function EffectConfig({ effect, onParameterChange, serverSchema }: EffectConfigProps): JSX.Element {
  const { t } = useTranslation();

  if (!effect) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200 dark:border-gray-600">
          <h5 className="font-medium text-slate-700 dark:text-gray-200">{t('audioEffects.configuration')}</h5>
        </div>
        <div className="flex-1 flex items-center justify-center text-slate-500 dark:text-gray-400 text-sm">
          {t('audioEffects.selectEffectToConfigure')}
        </div>
      </div>
    );
  }

  const effectDefinition = getEffectDefinition(effect.type, serverSchema);
  if (!effectDefinition) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200 dark:border-gray-600">
          <h5 className="font-medium text-slate-700 dark:text-gray-200">{t('audioEffects.unknownEffect')}</h5>
        </div>
        <div className="flex-1 flex items-center justify-center text-slate-500 dark:text-gray-400 text-sm">
          {t('audioEffects.effectDefinitionNotFound', { type: effect.type })}
        </div>
      </div>
    );
  }

  const handleChange = (paramKey: string, value: number | boolean | string) => {
    onParameterChange(effect.index, paramKey, value);
  };

  const renderParameter = (paramKey: string, definition: AudioEffectParameterDefinition) => {
    const value = effect.parameters[paramKey] ?? definition.defaultValue;
    
    switch (definition.type) {
      case 'slider':
        return (
          <SliderParameter
            key={paramKey}
            effectType={effect.type}
            paramKey={paramKey}
            definition={definition}
            value={value as number}
            onChange={(value) => handleChange(paramKey, value)}
          />
        );

      case 'toggle': {
        const boolValue = value as boolean;
        const translatedName = t(`effectsDefinition.${effect.type}.parameters.${paramKey}.name`, { defaultValue: definition.name });
        const translatedDesc = t(`effectsDefinition.${effect.type}.parameters.${paramKey}.description`, { defaultValue: definition.description });
        const labelText = translatedDesc ? `${translatedName} (${translatedDesc})` : translatedName;
        return (
          <div key={paramKey} className="flex items-center justify-between">
            <div className="flex items-center space-x-1">
              <label className={CSS_CLASSES.label}>
                {labelText}
              </label>
            </div>
            <button
              onClick={() => handleChange(paramKey, !boolValue)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                boolValue 
                  ? 'bg-blue-600' 
                  : 'bg-slate-200 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  boolValue ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        );
      }

      case 'select': {
        const stringValue = value as string;
        const translatedName = t(`effectsDefinition.${effect.type}.parameters.${paramKey}.name`, { defaultValue: definition.name });
        const translatedDesc = t(`effectsDefinition.${effect.type}.parameters.${paramKey}.description`, { defaultValue: definition.description });
        const labelText = translatedDesc ? `${translatedName} (${translatedDesc})` : translatedName;
        return (
          <div key={paramKey} className="space-y-2">
            <div className="flex items-center space-x-1">
              <label className={CSS_CLASSES.label}>
                {labelText}
              </label>
            </div>
            <select
              value={stringValue}
              onChange={(e) => handleChange(paramKey, e.target.value)}
              className={CSS_CLASSES.select}
            >
              {definition.options?.map((option: string) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200 dark:border-gray-600">
        <div>
          <h5 className="font-medium text-slate-700 dark:text-gray-200">
            {t(`effectsDefinition.${effect.type}.name`, { defaultValue: effectDefinition.name })}
          </h5>
          <div className="flex items-center space-x-2 mt-1">
            <p className="text-xs text-slate-500 dark:text-gray-400 capitalize">{t('audioEffects.effectTypeSuffix', { type: effect.type })}</p>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              effect.channel === 'input'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
            }`}>
              {t(`audioEffects.${effect.channel}`)} {t('audioEffects.channelLabelSuffix')}
            </span>
          </div>
        </div>
        <div className={`px-2 py-1 rounded text-xs font-medium ${
          effect.enabled 
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-slate-100 text-slate-600 dark:bg-gray-700 dark:text-gray-400'
        }`}>
          {effect.enabled ? t('audioEffects.enabled') : t('audioEffects.disabled')}
        </div>
      </div>

      {/* Parameters */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {Object.entries(effectDefinition.parameters).map(([paramKey, definition]) => 
          renderParameter(paramKey, definition as AudioEffectParameterDefinition)
        )}
      </div>
    </div>
  );
}

export default EffectConfig;