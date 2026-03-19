import { buildUserMarkdown } from '../defaults';

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

const SEX_OPTIONS = ['Female', 'Male', 'Unspecified'];
const OPTIONAL_ABSENT_VALUE = 'Absent';

const REQUIRED_FIELDS = [
  ['fullName', 'Name and surname'],
  ['sex', 'Sex'],
  ['birthday', 'Birthday'],
  ['language', 'Language'],
  ['country', 'Country'],
  ['city', 'City'],
  ['interests', 'Interests'],
  ['rules', 'Rules'],
  ['notes', 'Notes'],
];

function buildUserProfile(formData, overrides = {}) {
  const nextProfile = {
    fullName: formData.userFullName,
    sex: formData.userSex,
    birthday: formData.userBirthday,
    language: formData.userLanguage,
    country: formData.userCountry,
    city: formData.userCity,
    family: formData.userFamily,
    animals: formData.userAnimals,
    interests: formData.userInterests,
    rules: formData.userRules,
    notes: formData.userNotes,
    ...overrides,
  };

  return {
    ...nextProfile,
    family: String(nextProfile.family || '').trim() || OPTIONAL_ABSENT_VALUE,
    animals: String(nextProfile.animals || '').trim() || OPTIONAL_ABSENT_VALUE,
  };
}

function updateUserField(formData, onChange, field, value) {
  onChange(field, value);
  onChange(
    'userMarkdown',
    buildUserMarkdown(
      buildUserProfile(formData, {
        [field.replace(/^user/, '').replace(/^[A-Z]/, (letter) => letter.toLowerCase())]:
          value,
      }),
    ),
  );
}

function getLanguagePresetValue(formData) {
  return POPULAR_LANGUAGES.includes(formData.userLanguage)
    ? formData.userLanguage
    : 'custom';
}

function handleLanguagePresetChange(formData, onChange, value) {
  const nextLanguage = value === 'custom' ? formData.userLanguageCustom : value;

  onChange('userLanguagePreset', value);
  onChange('userLanguage', nextLanguage);
  onChange('userMarkdown', buildUserMarkdown(buildUserProfile(formData, { language: nextLanguage })));
}

function handleCustomLanguageChange(formData, onChange, value) {
  onChange('userLanguageCustom', value);
  updateUserField(formData, onChange, 'userLanguage', value);
}

function UserStep({ formData, onChange }) {
  const languagePresetValue = getLanguagePresetValue(formData);

  return (
    <div className="wizard-step">
      <div className="wizard-step-copy">
        <h2>Describe yourself</h2>
      </div>
      <div className="wizard-field-grid wizard-field-grid--triple">
        <label className="wizard-field">
          <span>Full name</span>
          <input
            className="wizard-input"
            type="text"
            value={formData.userFullName}
            onChange={(event) =>
              updateUserField(formData, onChange, 'userFullName', event.target.value)
            }
            placeholder="John Doe"
            required
          />
        </label>
        <label className="wizard-field">
          <span>Sex</span>
          <select
            className="wizard-input"
            value={formData.userSex}
            onChange={(event) =>
              updateUserField(formData, onChange, 'userSex', event.target.value)
            }
            required
          >
            {SEX_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="wizard-field">
          <span>Birthday</span>
          <input
            className="wizard-input"
            type="text"
            value={formData.userBirthday}
            onChange={(event) =>
              updateUserField(formData, onChange, 'userBirthday', event.target.value)
            }
            placeholder="March 17, 1979"
            required
          />
        </label>
        <label className="wizard-field">
          <span>Language</span>
          <select
            className="wizard-input"
            value={languagePresetValue}
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
        <label className="wizard-field">
          <span>Country</span>
          <input
            className="wizard-input"
            type="text"
            value={formData.userCountry}
            onChange={(event) =>
              updateUserField(formData, onChange, 'userCountry', event.target.value)
            }
            placeholder="USA"
            required
          />
        </label>
        <label className="wizard-field">
          <span>City</span>
          <input
            className="wizard-input"
            type="text"
            value={formData.userCity}
            onChange={(event) =>
              updateUserField(formData, onChange, 'userCity', event.target.value)
            }
            placeholder="New York City"
            required
          />
        </label>
      </div>
      {languagePresetValue === 'custom' ? (
        <label className="wizard-field">
          <span>Custom language details</span>
          <input
            className="wizard-input"
            type="text"
            value={formData.userLanguageCustom || formData.userLanguage}
            onChange={(event) =>
              handleCustomLanguageChange(formData, onChange, event.target.value)
            }
            placeholder="English"
            required
          />
        </label>
      ) : null}
      <label className="wizard-field">
        <span>Family</span>
        <input
          className="wizard-input"
          type="text"
          value={formData.userFamily}
          onChange={(event) =>
            updateUserField(formData, onChange, 'userFamily', event.target.value)
          }
          placeholder="Married. Wife: Jane. Daughter: Emma."
        />
      </label>
      <label className="wizard-field">
        <span>Animals</span>
        <input
          className="wizard-input"
          type="text"
          value={formData.userAnimals}
          onChange={(event) =>
            updateUserField(formData, onChange, 'userAnimals', event.target.value)
          }
          placeholder="Cat: Khaleesi. Dog: Archie."
        />
      </label>
      <label className="wizard-field">
        <span>Interests</span>
        <textarea
          className="wizard-textarea wizard-textarea--small"
          value={formData.userInterests}
          onChange={(event) =>
            updateUserField(formData, onChange, 'userInterests', event.target.value)
          }
          rows="2"
          placeholder="- Software development&#10;- Reading&#10;- Traveling"
          required
        />
      </label>
      <label className="wizard-field">
        <span>Rules</span>
        <textarea
          className="wizard-textarea wizard-textarea--small"
          value={formData.userRules}
          onChange={(event) =>
            updateUserField(formData, onChange, 'userRules', event.target.value)
          }
          rows="2"
          placeholder="- Be direct and stay on topic.&#10;- Remind about important deadlines."
          required
        />
      </label>
      <label className="wizard-field">
        <span>Notes</span>
        <textarea
          className="wizard-textarea wizard-textarea--small"
          value={formData.userNotes}
          onChange={(event) =>
            updateUserField(formData, onChange, 'userNotes', event.target.value)
          }
          rows="2"
          placeholder="- The user often works on technical and product tasks."
          required
        />
      </label>
    </div>
  );
}

export const wizardStep = {
  order: 2,
  title: 'User Profile',
  validate(formData) {
    for (const [field, label] of REQUIRED_FIELDS) {
      const value = String(formData[`user${field.charAt(0).toUpperCase()}${field.slice(1)}`] || '').trim();

      if (!value) {
        return `${label} is required.`;
      }
    }

    return '';
  },
  async persist(formData) {
    const markdown = buildUserMarkdown(buildUserProfile(formData));

    await window.appControls.saveUserMarkdown(markdown);
  },
  Component: UserStep,
};
