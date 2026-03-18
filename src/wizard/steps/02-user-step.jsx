import { buildUserMarkdown } from '../defaults';

const REQUIRED_FIELDS = [
  ['fullName', 'Name and surname'],
  ['sex', 'Sex'],
  ['birthday', 'Birthday'],
  ['language', 'Language'],
  ['country', 'Country'],
  ['city', 'City'],
  ['family', 'Family'],
  ['animals', 'Animals'],
  ['interests', 'Interests'],
  ['rules', 'Rules'],
  ['notes', 'Notes'],
];

function updateUserField(formData, onChange, field, value) {
  const nextProfile = {
    fullName: field === 'userFullName' ? value : formData.userFullName,
    sex: field === 'userSex' ? value : formData.userSex,
    birthday: field === 'userBirthday' ? value : formData.userBirthday,
    language: field === 'userLanguage' ? value : formData.userLanguage,
    country: field === 'userCountry' ? value : formData.userCountry,
    city: field === 'userCity' ? value : formData.userCity,
    family: field === 'userFamily' ? value : formData.userFamily,
    animals: field === 'userAnimals' ? value : formData.userAnimals,
    interests: field === 'userInterests' ? value : formData.userInterests,
    rules: field === 'userRules' ? value : formData.userRules,
    notes: field === 'userNotes' ? value : formData.userNotes,
  };

  onChange(field, value);
  onChange('userMarkdown', buildUserMarkdown(nextProfile));
}

function UserStep({ formData, onChange }) {
  return (
    <div className="wizard-step">
      <div className="wizard-step-copy">
        <h2>Configure `USER.md`</h2>
        <p>
          Fill in the full user profile. Every field is required because this
          data is used to build `USER.md`.
        </p>
      </div>
      <label className="wizard-field">
        <span>Name and surname</span>
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
        <input
          className="wizard-input"
          type="text"
          value={formData.userSex}
          onChange={(event) =>
            updateUserField(formData, onChange, 'userSex', event.target.value)
          }
          placeholder="Male"
          required
        />
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
          placeholder="1979 March 17"
          required
        />
      </label>
      <label className="wizard-field">
        <span>Language</span>
        <input
          className="wizard-input"
          type="text"
          value={formData.userLanguage}
          onChange={(event) =>
            updateUserField(formData, onChange, 'userLanguage', event.target.value)
          }
          placeholder="Russian (native), English (fluent)"
          required
        />
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
          placeholder="Kazakhstan"
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
          placeholder="Astana"
          required
        />
      </label>
      <label className="wizard-field">
        <span>Family</span>
        <textarea
          className="wizard-textarea"
          value={formData.userFamily}
          onChange={(event) =>
            updateUserField(formData, onChange, 'userFamily', event.target.value)
          }
          rows="3"
          placeholder="Wife: Jane"
          required
        />
      </label>
      <label className="wizard-field">
        <span>Animals</span>
        <textarea
          className="wizard-textarea"
          value={formData.userAnimals}
          onChange={(event) =>
            updateUserField(formData, onChange, 'userAnimals', event.target.value)
          }
          rows="3"
          placeholder="Cat: Khaleesi"
          required
        />
      </label>
      <label className="wizard-field">
        <span>Interests</span>
        <textarea
          className="wizard-textarea"
          value={formData.userInterests}
          onChange={(event) =>
            updateUserField(formData, onChange, 'userInterests', event.target.value)
          }
          rows="4"
          placeholder="- Software development&#10;- Reading&#10;- Traveling"
          required
        />
      </label>
      <label className="wizard-field">
        <span>Rules</span>
        <textarea
          className="wizard-textarea"
          value={formData.userRules}
          onChange={(event) =>
            updateUserField(formData, onChange, 'userRules', event.target.value)
          }
          rows="4"
          placeholder="- Be direct and stay on topic."
          required
        />
      </label>
      <label className="wizard-field">
        <span>Notes</span>
        <textarea
          className="wizard-textarea"
          value={formData.userNotes}
          onChange={(event) =>
            updateUserField(formData, onChange, 'userNotes', event.target.value)
          }
          rows="5"
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
    const markdown = buildUserMarkdown({
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
    });

    await window.appControls.saveUserMarkdown(markdown);
  },
  Component: UserStep,
};
