import { useState, ChangeEvent, useEffect } from 'react';
import { ClientState, ModelFileKind, ModelUploadSetting, RVCModelSlot } from '@dannadori/voice-changer-client-js';
import { CSS_CLASSES } from '../../../styles/constants';
import GenericModal from '../../Modals/GenericModal';
import { UIContextType } from '../../../context/UIContext';
import { useTranslation } from 'react-i18next';

interface ExtendedServerSetting {
  embedders?: any;
  modelSlots?: any[];
  modelSlotIndex?: number;
  [key: string]: any;
}

interface ExtendedModelUploadSetting extends Omit<ModelUploadSetting, 'embedder' | 'isSampleMode' | 'sampleId'> {
  embedder?: string;
  isSampleMode?: boolean;
  sampleId?: number | null;
}

export interface UploadFinalForm {
  modelName: string
  thumbnailFile: File | null
  voiceChangerType: string
  slot: number
  files: { kind: ModelFileKind; file: File; dir: string }[]
  params: any
  embedder: string
}

interface UploadModelModalProps {
  appState: ClientState
  guiState: UIContextType
  showUpload: boolean
  setShowUpload: (showUpload: boolean) => void
}

function UploadModelModal({ appState, guiState, showUpload, setShowUpload }: UploadModelModalProps) {
  const { t } = useTranslation();
  const serverSetting = appState.serverSetting?.serverSetting as ExtendedServerSetting | undefined;

  // ---------------- Component State ----------------
  const [uploadSettings, setUploadSettings] = useState<UploadFinalForm>({
    modelName: '',
    thumbnailFile: null,
    voiceChangerType: 'RVC',
    slot: 0,
    files: [],
    params: {},
    embedder: serverSetting?.embedders?.[0]?.name || ''
  });
  const [autoSelectModel, setAutoSelectModel] = useState<boolean>(false);

  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [isThumbnailExpanded, setIsThumbnailExpanded] = useState(false);
  const [previewMode, setPreviewMode] = useState<'settings' | 'list'>('settings');

  // ---------------- Side Effects ----------------

  // Auto-populate model name from selected file and handle thumbnail preview
  useEffect(() => {
    // Extract base filename (without extension) to auto-populate model name field
    const model = uploadSettings.files.find(x => x.kind === "rvcModel")
    if (model) {
      const baseName = model.file.name.substring(0, model.file.name.lastIndexOf('.'));
      setUploadSettings({ ...uploadSettings, modelName: baseName });
    }
    // Expand thumbnail preview automatically for better user visibility
    if (thumbnailPreview) {
      setIsThumbnailExpanded(true);
    }

  }, [uploadSettings.files, thumbnailPreview]);

  // ---------------- File Upload Handlers ----------------

  // Process main model file selection (.pth, .safetensors, .onnx, .zip)
  const handleModelFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      const isZip = file.name.toLowerCase().endsWith('.zip');

      const newFile = { kind: "rvcModel" as ModelFileKind, file: file, dir: "" };

      // If it's a zip file, remove any existing index file
      const updatedFiles = uploadSettings.files.filter(f =>
        f.kind !== "rvcModel" && (!isZip || f.kind !== "rvcIndex")
      );
      updatedFiles.push(newFile);

      setUploadSettings({
        ...uploadSettings,
        files: updatedFiles,
        modelName: file.name.replace(/\.[^/.]+$/, '')
      });
    } else {
      const updatedFiles = uploadSettings.files.filter(f => f.kind !== "rvcModel");

      setUploadSettings({
        ...uploadSettings,
        files: updatedFiles,
        modelName: ''
      });
    }
  };

  // Process optional index file selection (.index)
  const handleIndexFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const newFile = { kind: "rvcIndex" as ModelFileKind, file: event.target.files[0], dir: "" };

      const updatedFiles = uploadSettings.files.filter(f => f.kind !== "rvcIndex");
      updatedFiles.push(newFile);

      setUploadSettings({
        ...uploadSettings,
        files: updatedFiles
      });
    } else {
      const updatedFiles = uploadSettings.files.filter(f => f.kind !== "rvcIndex");

      setUploadSettings({
        ...uploadSettings,
        files: updatedFiles
      });
    }
  };

  // Process optional thumbnail image selection
  const handleThumbnailFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setUploadSettings({ ...uploadSettings, thumbnailFile: file });
      const reader = new FileReader();
      reader.onloadend = () => {
        setThumbnailPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setUploadSettings({ ...uploadSettings, thumbnailFile: null });
      setThumbnailPreview(null);
    }
  };

  // ---------------- Modal Actions ----------------

  // Close modal and reset form state
  const handleUploadCloseModal = () => {
    if (!appState.serverSetting.isUploading) {
      setShowUpload(false);
      setUploadSettings({
        modelName: '',
        thumbnailFile: null,
        voiceChangerType: 'RVC',
        slot: 0,
        files: [],
        params: {},
        embedder: serverSetting?.embedders?.[0]?.name || ''
      });
      setAutoSelectModel(false);
      setThumbnailPreview(null);  // Reset thumbnail preview
      setIsThumbnailExpanded(false);  // Collapse thumbnail preview
    }
  };

  // Execute the complete model upload workflow
  const handleUploadModal = async () => {
    if (!uploadSettings.files) {
      guiState.showError(t('uploadModel.errorSelectModel'), 'Error');
      return;
    }
    const trimmedModelName = uploadSettings.modelName.trim();
    if (!trimmedModelName) {
      guiState.showError(t('uploadModel.errorEnterName'), 'Error');
      return;
    }

    try {
      let emptySlotIndex = -1;
      const currentModelSlots = appState.serverSetting.serverSetting.modelSlots;

      // Find first available empty slot for the new model
      if (currentModelSlots && currentModelSlots.length > 0) {
        emptySlotIndex = currentModelSlots.findIndex((slot: any) => !slot.name || slot.name.length === 0);
      }

      if (emptySlotIndex === -1) {
        guiState.showError(t('uploadModel.errorNoSlot'), 'Error');
        return;
      }

      // Build files list while renaming to the entered model name + original extension
      const sanitizeBaseName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "_").trim();
      const baseName = sanitizeBaseName(trimmedModelName);
      const renameWithExt = (f: File, bn: string) => {
        const dotPos = f.name.lastIndexOf('.');
        const ext = dotPos >= 0 ? f.name.substring(dotPos) : '';
        const newName = `${bn}${ext}`;
        return new File([f], newName, { type: f.type, lastModified: f.lastModified });
      };

      const modelEntry = uploadSettings.files.find(f => f.kind === "rvcModel");
      const indexEntry = uploadSettings.files.find(f => f.kind === "rvcIndex");

      const filesForUpload: { kind: ModelFileKind; file: File; dir: string }[] = [];
      if (modelEntry) {
        filesForUpload.push({ kind: "rvcModel" as ModelFileKind, file: renameWithExt(modelEntry.file, baseName), dir: "" });
      }
      if (indexEntry) {
        filesForUpload.push({ kind: "rvcIndex" as ModelFileKind, file: renameWithExt(indexEntry.file, "added_" + baseName), dir: "" });
      }

      const uploadSettingsData: ExtendedModelUploadSetting = {
        voiceChangerType: "RVC",
        slot: emptySlotIndex,
        files: filesForUpload,
        params: {},
        embedder: uploadSettings.embedder
      }

      // Upload main model files (model + optional index file)
      console.log('Uploading model with settings:', uploadSettingsData);
      const serverInfo = (await appState.serverSetting.uploadModel(uploadSettingsData as any)) as any;

      // Verify that the model was actually uploaded by checking if the slot has a model file
      const uploadedModel = serverInfo.modelSlots[emptySlotIndex];
      const hasModelFile = uploadedModel && 'modelFile' in uploadedModel && uploadedModel.modelFile;

      if (hasModelFile) {
        console.log('Model uploaded successfully.');

        // Upload thumbnail image as separate asset if provided
        if (uploadSettings.thumbnailFile) {
          console.log(`Uploading icon to slot ${emptySlotIndex}...`);
          const thumb = uploadSettings.thumbnailFile;
          const dotPos = thumb.name.lastIndexOf('.');
          const extOnly = dotPos >= 0 ? thumb.name.substring(dotPos + 1) : '';
          const thumbName = extOnly ? `thumbnail.${extOnly}` : 'thumbnail';
          const renamedThumb = new File([thumb], thumbName, { type: thumb.type, lastModified: thumb.lastModified });
          await appState.serverSetting.uploadAssets(emptySlotIndex, "iconFile", renamedThumb);
          console.log('Icon uploaded.');
        }

        // Notify user of successful upload
        guiState.showError(t('uploadModel.successMessage'), 'Confirm');

        // Automatically switch to the newly uploaded model if requested
        if (autoSelectModel) {
          guiState.startLoading(t('uploadModel.swappingToModel') + uploadSettings.modelName);
          await appState.serverSetting.updateServerSettings({
            ...appState.serverSetting.serverSetting,
            modelSlotIndex: emptySlotIndex
          });
          guiState.stopLoading();
        }
      } else {
        console.error('Model upload failed - no model file found in slot after upload');
        guiState.showError(t('uploadModel.errorSaveFailed'), 'Error');
        return; // Exit early if model upload failed
      }

      handleUploadCloseModal();
    } catch (error) {
      console.error('Error uploading model:', error);
      guiState.showError(`${t('uploadModel.errorUploading')}${error instanceof Error ? error.message : String(error)}`, 'Error');
    }
  };

  // ---------------- Component Render ----------------

  return (
    <GenericModal
      isOpen={showUpload}
      onClose={handleUploadCloseModal}
      title={t('uploadModel.title')}
      closeOnOutsideClick={false}
      primaryButton={{
        text: `${appState.serverSetting.isUploading ? `${t('uploadModel.uploading')} (${appState.serverSetting.uploadProgress.toFixed(1)}%)` : t('uploadModel.upload')}`,
        onClick: handleUploadModal,
        className: CSS_CLASSES.modalPrimaryButton,
        disabled: appState.serverSetting.isUploading
      }}
      secondaryButton={
        {
          text: t('uploadModel.cancel'),
          onClick: handleUploadCloseModal,
          className: CSS_CLASSES.modalSecondaryButton,
          disabled: appState.serverSetting.isUploading
        }
      }
    >
      <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-2">
        {/* Main model file input - Required for upload */}
        <div>
          <label htmlFor="modelFile" className={CSS_CLASSES.label}>{t('uploadModel.modelFileLabel')}</label>
          <input
            type="file"
            id="modelFile"
            accept=".pth,.safetensors,.onnx,.zip"
            onChange={handleModelFileChange}
            className={CSS_CLASSES.fileInput}
            disabled={appState.serverSetting.isUploading}
          />
        </div>

        {/* Model configuration options - Only shown after model file is selected */}
        {uploadSettings.files.find(x => x.kind === "rvcModel") && (
          <div className="space-y-4 ml-2 pl-3 border-l-2 border-slate-200 dark:border-gray-700">
            {/* Model name input with auto-population from filename */}
            <div className="space-y-2">
              <label htmlFor="modelName" className={CSS_CLASSES.label}>{t('uploadModel.modelNameLabel')}</label>
              <div className="relative">
                <input
                  type="text"
                  id="modelName"
                  value={uploadSettings.modelName}
                  onChange={(e) => setUploadSettings({ ...uploadSettings, modelName: e.target.value })}
                  className={`${CSS_CLASSES.input} pl-3 pr-10 py-2 bg-white/50 dark:bg-gray-700/50 border-slate-300/70 dark:border-gray-600/70 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent text-sm`}
                  placeholder={t('uploadModel.modelNamePlaceholder')}
                  disabled={appState.serverSetting.isUploading}
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Embedder selection */}
            <div className="space-y-2">
              <label htmlFor="embedderType" className={CSS_CLASSES.label}>{t('uploadModel.embedderTypeLabel')}</label>
              <select
                id="embedderType"
                value={uploadSettings.embedder}
                onChange={(e) => setUploadSettings({ ...uploadSettings, embedder: e.target.value })}
                className={CSS_CLASSES.select}
                disabled={appState.serverSetting.isUploading}
              >
                {Object.entries(serverSetting?.embedders || {})
                  .filter(([_, embedder]) => (embedder as any).downloaded === true)
                  .length === 0 ? (
                  <option value="">{t('uploadModel.noEmbedders')}</option>
                ) : (
                  Object.entries(serverSetting?.embedders || {})
                    .filter(([_, embedder]) => (embedder as any).downloaded === true)
                    .map(([key, embedder]) => (
                      <option key={key} value={key}>
                        {(embedder as any).name}
                      </option>
                    ))
                )}
              </select>
            </div>
          </div>
        )}

        {/* Optional index file for improved conversion quality */}
        <div>
          <label htmlFor="indexFile" className={CSS_CLASSES.label}>{t('uploadModel.indexFileLabel')}</label>
          <input
            type="file"
            id="indexFile"
            accept=".index"
            onChange={handleIndexFileChange}
            className={CSS_CLASSES.fileInput}
            disabled={appState.serverSetting.isUploading}
          />
        </div>

        {/* Optional thumbnail image with live preview */}
        <div>
          <label htmlFor="thumbnailFile" className={CSS_CLASSES.label}>{t('uploadModel.thumbnailFileLabel')}</label>
          <input
            type="file"
            id="thumbnailFile"
            accept="image/*"
            onChange={handleThumbnailFileChange}
            className={CSS_CLASSES.fileInput}
            disabled={appState.serverSetting.isUploading}
          />
        </div>

        {/* Thumbnail preview section with expandable interface */}
        {thumbnailPreview && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setIsThumbnailExpanded(!isThumbnailExpanded)}
              className="flex items-center justify-between w-full text-sm font-medium text-slate-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
              disabled={appState.serverSetting.isUploading}
            >
              <span>{t('uploadModel.previewThumbnail')}</span>
              <svg
                className={`ml-2 h-4 w-4 transition-transform duration-200 ${isThumbnailExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isThumbnailExpanded && (
              <div className="space-y-4 p-3 bg-slate-50 dark:bg-gray-800/30 rounded-lg border border-slate-200 dark:border-gray-700">
                {/* Preview mode toggle - Shows how thumbnail appears in different UI contexts */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600 dark:text-gray-300">{t('uploadModel.previewMode')}</span>
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setPreviewMode('settings'); }}
                      className={`px-3 py-1 text-xs rounded-md transition-colors ${previewMode === 'settings' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'text-slate-500 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-gray-700'} disabled:opacity-50`}
                      disabled={appState.serverSetting.isUploading}
                    >
                      {t('uploadModel.previewSettings')}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setPreviewMode('list'); }}
                      className={`px-3 py-1 text-xs rounded-md transition-colors ${previewMode === 'list' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'text-slate-500 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-gray-700'} disabled:opacity-50`}
                      disabled={appState.serverSetting.isUploading}
                    >
                      {t('uploadModel.previewList')}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-center p-4">
                  <div className={`transition-all duration-200 ${previewMode === 'settings'
                    ? 'w-32 h-32 rounded-full p-1.5 border-2 border-slate-300 dark:border-gray-500'
                    : 'w-36 h-36 rounded-xl p-1.5 border border-slate-300 dark:border-gray-500'
                    } bg-white dark:bg-gray-800 shadow-md overflow-hidden`}>
                    <img
                      src={thumbnailPreview}
                      alt="Thumbnail preview"
                      className={`w-full h-full object-cover ${previewMode === 'settings' ? 'rounded-full' : 'rounded-lg'
                        }`}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Auto-select model after upload */}
        <div className="flex items-center">
          <input
            id="auto-select"
            type="checkbox"
            className={CSS_CLASSES.checkbox}
            checked={autoSelectModel}
            onChange={(e) => setAutoSelectModel(e.target.checked)}
          />
          <label htmlFor="auto-select" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
            {t('uploadModel.selectAfterUpload')}
          </label>
        </div>
      </div>
    </GenericModal>
  );
};

export default UploadModelModal;
