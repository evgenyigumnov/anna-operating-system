const IDENTITY_PROFILE_DEFAULTS = {
  name: 'Anna',
  sex: 'Female',
  language: 'English',
  style: 'Simple, concise, and with a sense of humor.',
  rules:
    '- If a user asks about your capabilities, explain them in general terms without using programming jargon.\n- If a user asks about a specific tool, explain how to use it in general terms and provide examples.',
  operatingSystem: '',
};

const IDENTITY_SECTION_ORDER = [
  ['Name', 'name'],
  ['Sex', 'sex'],
  ['Language', 'language'],
  ['Style', 'style'],
  ['Rules', 'rules'],
  ['Operating System', 'operatingSystem'],
];

const USER_PROFILE_DEFAULTS = {
  fullName: '',
  sex: 'Unspecified',
  birthday: '',
  language: 'English',
  country: 'USA',
  city: 'New York',
  family: '',
  animals: '',
  interests: '- Reading\n- Traveling',
  rules: '- Be direct and stay on topic.\n- Do not overload with unnecessary explanations.',
  notes:
    '-I may combine work, travel, and personal planning in one workflow.\n- Important personal context can include close family members and pets.',
};

const USER_SECTION_ORDER = [
  ['Name and surname', 'fullName'],
  ['Sex', 'sex'],
  ['Birthday', 'birthday'],
  ['Language', 'language'],
  ['Country', 'country'],
  ['City', 'city'],
  ['Family', 'family'],
  ['Animals', 'animals'],
  ['Interests', 'interests'],
  ['Rules', 'rules'],
  ['Notes', 'notes'],
];

export const EMAIL_SETTINGS_DEFAULTS = {
  emailImapHost: 'imap.gmail.com',
  emailImapPort: '993',
  emailImapSecure: 'true',
  emailImapUser: '',
  emailImapPassword: '',
  emailSmtpHost: 'smtp.gmail.com',
  emailSmtpPort: '465',
  emailSmtpSecure: 'true',
  emailSmtpUser: '',
  emailSmtpPassword: '',
};

export function buildIdentityMarkdown(identityProfile) {
  return IDENTITY_SECTION_ORDER.map(([title, key]) => {
    const value = String(identityProfile?.[key] ?? '').trim();
    return `# ${title}\n\n${value}`;
  }).join('\n\n');
}

export function parseIdentityMarkdown(markdown) {
  const normalizedMarkdown = String(markdown || '').trim();

  if (!normalizedMarkdown) {
    return { ...IDENTITY_PROFILE_DEFAULTS };
  }

  const matches = [...normalizedMarkdown.matchAll(/^# (.+)\n\n([\s\S]*?)(?=^# |\s*$)/gm)];
  const sections = Object.fromEntries(
    matches.map(([, title, value]) => [title.trim().toLowerCase(), value.trim()]),
  );

  const resolveSectionValue = (aliases, fallback) => {
    const matchedAlias = aliases.find((alias) => {
      const value = sections[alias];
      return typeof value === 'string' && value.trim();
    });

    return matchedAlias ? sections[matchedAlias].trim() : fallback;
  };

  return {
    name: resolveSectionValue(['name'], IDENTITY_PROFILE_DEFAULTS.name),
    sex: resolveSectionValue(['sex', 'gender'], IDENTITY_PROFILE_DEFAULTS.sex),
    language: resolveSectionValue(
      ['language', 'locale'],
      IDENTITY_PROFILE_DEFAULTS.language,
    ),
    style: resolveSectionValue(['style'], IDENTITY_PROFILE_DEFAULTS.style),
    rules: resolveSectionValue(['rules'], IDENTITY_PROFILE_DEFAULTS.rules),
    operatingSystem: resolveSectionValue(
      ['operating system', 'os'],
      IDENTITY_PROFILE_DEFAULTS.operatingSystem,
    ),
  };
}

export function buildUserMarkdown(userProfile) {
  return USER_SECTION_ORDER.map(([title, key]) => {
    const value = String(userProfile?.[key] ?? '').trim();
    return `# ${title}\n\n${value}`;
  }).join('\n\n');
}

export function parseUserMarkdown(markdown) {
  const normalizedMarkdown = String(markdown || '').trim();

  if (!normalizedMarkdown) {
    return { ...USER_PROFILE_DEFAULTS };
  }

  const matches = [...normalizedMarkdown.matchAll(/^# (.+)\n\n([\s\S]*?)(?=^# |\s*$)/gm)];
  const sections = Object.fromEntries(
    matches.map(([, title, value]) => [title.trim(), value.trim()]),
  );

  return USER_SECTION_ORDER.reduce((result, [title, key]) => {
    result[key] =
      typeof sections[title] === 'string' && sections[title].trim()
        ? sections[title].trim()
        : USER_PROFILE_DEFAULTS[key];

    return result;
  }, {});
}

export function getDefaultEmailMarkdown(userName) {
  const normalizedUserName = String(userName || '').trim() || '{{user_name}}';

  return `# Rules

- If a new email is important, show a short summary.
- Important emails are: from real people, about work, money, bookings, deliveries, codes, confirmations, or deadlines.
- If the email is not important, spam, or advertising, do not bother the user.
- Say who sent it, what it is about, and whether action is needed.
- If a reply is needed, suggest a short draft.
- Never open links, download attachments, or send anything automatically.
- If an email looks suspicious, warn the user.
- Use the email template below.

# Format

\`\`\`
From: {{from}}
Subject: {{subject}}
Summary: {{summary}}
Action: {{action_needed}}
Reply: {{reply_needed}}
\`\`\`

# Email Template (MANDATORY)

\`\`\`
Hello {{name}},

{{message}}

Best regards,
${normalizedUserName}
\`\`\``;
}

export { IDENTITY_PROFILE_DEFAULTS, USER_PROFILE_DEFAULTS };
