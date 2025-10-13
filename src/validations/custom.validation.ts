import Joi from 'joi';

// List of common weak passwords to block
const COMMON_PASSWORDS = [
  'password', 'password123', 'qwerty', 'qwerty123', '12345678', 
  'admin123', 'welcome123', 'letmein', 'monkey', 'dragon',
  'master', 'sunshine', 'princess', 'football', 'shadow',
  'abc123', 'abcd1234', '123456789', 'iloveyou', 'trustno1'
];

export const password: Joi.CustomValidator<string> = (value, helpers) => {
  // Check minimum length
  if (value.length < 8) {
    return helpers.error('password.minLength', { 
      message: 'Password must be at least 8 characters long' 
    });
  }

  // Check maximum length (prevent DoS attacks)
  if (value.length > 128) {
    return helpers.error('password.maxLength', { 
      message: 'Password must not exceed 128 characters' 
    });
  }

  // Check for at least one letter
  if (!value.match(/[a-zA-Z]/)) {
    return helpers.error('password.letter', { 
      message: 'Password must contain at least one letter' 
    });
  }

  // Check for at least one number
  if (!value.match(/\d/)) {
    return helpers.error('password.number', { 
      message: 'Password must contain at least one number' 
    });
  }

  // Check for at least one special character - FIXED REGEX
  if (!value.match(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/)) {
    return helpers.error('password.specialChar', { 
      message: 'Password must contain at least one special character (!@#$%^&*, etc.)' 
    });
  }

  // Check for both uppercase and lowercase (recommended)
  if (!value.match(/[a-z]/) || !value.match(/[A-Z]/)) {
    return helpers.error('password.case', { 
      message: 'Password must contain both uppercase and lowercase letters' 
    });
  }

  // Check against common passwords
  const lowerValue = value.toLowerCase();
  if (COMMON_PASSWORDS.some(common => lowerValue.includes(common))) {
    return helpers.error('password.common', { 
      message: 'Password is too common. Please choose a more unique password' 
    });
  }

  // // Check for sequential characters (123, abc, etc.)
  // if (/(?:012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i.test(value)) {
  //   return helpers.error('password.sequential', { 
  //     message: 'Password should not contain sequential characters' 
  //   });
  // }

  // Check for repeated characters (aaa, 111, etc.)
  if (/(.)\1{2,}/.test(value)) {
    return helpers.error('password.repeated', { 
      message: 'Password should not contain repeated characters' 
    });
  }

  return value;
};
