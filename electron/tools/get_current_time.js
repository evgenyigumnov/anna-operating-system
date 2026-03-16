module.exports = {
  definition: {
    type: 'function',
    function: {
      name: 'get_cДurrent_time',
      description: 'Returns the current local time for the Electron app runtime.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  handler: async () => ({
    iso: new Date().toISOString(),
    local: new Date().toLocaleString('ru-RU'),
  }),
};
