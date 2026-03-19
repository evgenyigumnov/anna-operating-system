import { buildIdentityMarkdown } from '../defaults';

const POPULAR_LANGUAGES = [
  'English',
  'Español',
  'Français',
  'Deutsch',
  'Português',
  'Русский',
  'العربية',
  'हिन्दी',
  '中文',
  '日本語',
];

const REQUIRED_FIELDS = [
  ['identityName', 'Name'],
  ['identitySex', 'Sex'],
  ['identityLanguage', 'Language'],
  ['identityStyle', 'Style'],
];

function updateIdentityField(formData, onChange, field, value) {
  const nextIdentity = {
    name: field === 'identityName' ? value : formData.identityName,
    sex: field === 'identitySex' ? value : formData.identitySex,
    language: field === 'identityLanguage' ? value : formData.identityLanguage,
    style: field === 'identityStyle' ? value : formData.identityStyle,
    rules: field === 'identityRules' ? value : formData.identityRules,
    operatingSystem:
      field === 'identityOperatingSystem'
        ? value
        : formData.identityOperatingSystem,
  };

  onChange(field, value);
  onChange('identityMarkdown', buildIdentityMarkdown(nextIdentity));
}

function handleLanguagePresetChange(formData, onChange, value) {
  const isCustom = value === 'custom';
  const nextLanguage = isCustom
    ? formData.identityLanguageCustom
    : value;

  onChange('identityLanguagePreset', value);
  onChange('identityLanguage', nextLanguage);
  onChange(
    'identityMarkdown',
    buildIdentityMarkdown({
      name: formData.identityName,
      sex: formData.identitySex,
      language: nextLanguage,
      style: formData.identityStyle,
      rules: formData.identityRules,
      operatingSystem: formData.identityOperatingSystem,
    }),
  );
}

function handleCustomLanguageChange(formData, onChange, value) {
  onChange('identityLanguageCustom', value);
  updateIdentityField(formData, onChange, 'identityLanguage', value);
}

function IdentityStep({ formData, onChange }) {
  return (
    <div className="wizard-step">
      <div className="wizard-step-copy">
        <h2>Configure AI assistant profile</h2>
      </div>
      <label className="wizard-field">
        <span>Assistant name</span>
        <input
          className="wizard-input"
          type="text"
          value={formData.identityName}
          onChange={(event) =>
            updateIdentityField(formData, onChange, 'identityName', event.target.value)
          }
          placeholder="Anna"
          required
        />
      </label>
      <label className="wizard-field">
        <span>Sex</span>
        <select
          className="wizard-input"
          value={formData.identitySex}
          onChange={(event) =>
            updateIdentityField(formData, onChange, 'identitySex', event.target.value)
          }
          required
        >
          <option value="Female">Female</option>
          <option value="Male">Male</option>
          <option value="Unspecified">Unspecified</option>
        </select>
      </label>
      <label className="wizard-field">
        <span>Language</span>
        <select
          className="wizard-input"
          value={formData.identityLanguagePreset}
          onChange={(event) =>
            handleLanguagePresetChange(formData, onChange, event.target.value)
          }
          required
        >
          {POPULAR_LANGUAGES.map((language) => (
            <option key={language} value={language}>
              {language}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </label>
      {formData.identityLanguagePreset === 'custom' ? (
        <label className="wizard-field">
          <span>Custom language</span>
          <input
            className="wizard-input"
            type="text"
            value={formData.identityLanguageCustom}
            onChange={(event) =>
              handleCustomLanguageChange(formData, onChange, event.target.value)
            }
            placeholder="Type any language"
            required
          />
        </label>
      ) : null}
      <label className="wizard-field">
        <span>Communication style</span>
        <textarea
          className="wizard-textarea wizard-textarea--small"
          value={formData.identityStyle}
          onChange={(event) =>
            updateIdentityField(formData, onChange, 'identityStyle', event.target.value)
          }
          rows="2"
          placeholder="Simple, concise, and with a sense of humor."
          required
        />
      </label>
      <label className="wizard-field">
        <span>Rules and behavior</span>
        <textarea
          className="wizard-textarea wizard-textarea--compact"
          value={formData.identityRules}
          onChange={(event) =>
            updateIdentityField(formData, onChange, 'identityRules', event.target.value)
          }
          rows="4"
          placeholder="- Explain capabilities in plain language.&#10;- Provide examples when needed."
        />
      </label>
    </div>
  );
}

export const wizardStep = {
  order: 1,
  title: 'Identity',
  validate(formData) {
    for (const [field, label] of REQUIRED_FIELDS) {
      const value = String(formData[field] || '').trim();

      if (!value) {
        return `${label} is required.`;
      }
    }

    return '';
  },
  async persist(formData) {
    await window.appControls.saveIdentityMarkdown(formData.identityMarkdown);
  },
  Component: IdentityStep,
};
