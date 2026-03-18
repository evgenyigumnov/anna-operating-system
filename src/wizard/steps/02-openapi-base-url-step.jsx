function OpenApiBaseUrlStep({ formData, onChange }) {
  return (
    <div className="wizard-step">
      <div className="wizard-step-copy">
        <h2>Configure `OPENAPI_BASE_URL`</h2>
        <p>
          Set the base URL that the Electron process will use for OpenAI-compatible
          requests.
        </p>
      </div>
      <label className="wizard-field">
        <span>OPENAPI_BASE_URL</span>
        <input
          className="wizard-input"
          type="url"
          value={formData.openApiBaseUrl}
          onChange={(event) => onChange('openApiBaseUrl', event.target.value)}
          placeholder="http://127.0.0.1:11434/v1"
        />
      </label>
    </div>
  );
}

export const wizardStep = {
  order: 6,
  title: 'OpenAPI Base URL',
  validate(formData) {
    if (!formData.openApiBaseUrl.trim()) {
      return 'OPENAPI_BASE_URL cannot be empty.';
    }

    return '';
  },
  async persist(formData) {
    await window.appControls.saveOpenApiBaseUrl(formData.openApiBaseUrl);
  },
  Component: OpenApiBaseUrlStep,
};
