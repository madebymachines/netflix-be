import Joi from 'joi';

const COMMON_PASSWORDS = [
  'password',
  'password123',
  'qwerty',
  'qwerty123',
  '12345678',
  'admin123',
  'welcome123',
  'letmein',
  'monkey',
  'dragon',
  'master',
  'sunshine',
  'princess',
  'football',
  'shadow',
  'abc123',
  'abcd1234',
  '123456789',
  'iloveyou',
  'trustno1'
];

export const password: Joi.CustomValidator<string> = (value, helpers) => {
  // Check minimum length
  if (value.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  // Check maximum length
  if (value.length > 128) {
    throw new Error('Password must not exceed 128 characters');
  }

  // Check for at least one letter
  if (!value.match(/[a-zA-Z]/)) {
    throw new Error('Password must contain at least one letter');
  }

  // Check for at least one number
  if (!value.match(/\d/)) {
    throw new Error('Password must contain at least one number');
  }

  // Check for at least one special character
  if (!value.match(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/)) {
    throw new Error('Password must contain at least one special character (!@#$%^&*, etc.)');
  }

  // Check for both uppercase and lowercase
  if (!value.match(/[a-z]/) || !value.match(/[A-Z]/)) {
    throw new Error('Password must contain both uppercase and lowercase letters');
  }

  // Check against common passwords
  const lowerValue = value.toLowerCase();
  if (COMMON_PASSWORDS.some((common) => lowerValue.includes(common))) {
    throw new Error('Password is too common. Please choose a more unique password');
  }

  // Check for repeated characters
  if (/(.)\1{2,}/.test(value)) {
    throw new Error('Password should not contain repeated characters');
  }

  return value;
};