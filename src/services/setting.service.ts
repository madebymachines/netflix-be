import prisma from '../client';
import { Setting } from '@prisma/client';

const getSetting = async (key: string): Promise<Setting | null> => {
  return prisma.setting.findUnique({ where: { key } });
};

const upsertSetting = async (key: string, value: string): Promise<Setting> => {
  return prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  });
};

const getRegistrationSettings = async () => {
  const isOpenSetting = await getSetting('isRegistrationOpen');
  const limitSetting = await getSetting('registrationLimit');

  return {
    isRegistrationOpen: isOpenSetting ? isOpenSetting.value === 'true' : true, // default to true if not set
    registrationLimit: limitSetting ? parseInt(limitSetting.value, 10) : 0 // default to 0 (no limit)
  };
};

const updateRegistrationSettings = async (
  isRegistrationOpen: boolean,
  registrationLimit: number
) => {
  await upsertSetting('isRegistrationOpen', String(isRegistrationOpen));
  await upsertSetting('registrationLimit', String(registrationLimit));

  return { isRegistrationOpen, registrationLimit };
};

const getWinnerEmailRecipients = async (): Promise<string[]> => {
  const setting = await getSetting('WINNERS_EMAIL_RECIPIENTS');
  if (!setting || !setting.value) {
    return [];
  }
  return setting.value
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
};

const updateWinnerEmailRecipients = async (emails: string[]): Promise<void> => {
  const value = emails.join(',');
  await upsertSetting('WINNERS_EMAIL_RECIPIENTS', value);
};

export default {
  getRegistrationSettings,
  updateRegistrationSettings,
  getWinnerEmailRecipients,
  updateWinnerEmailRecipients
};
