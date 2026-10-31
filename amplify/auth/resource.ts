import { defineAuth } from '@aws-amplify/backend';

/**
 * Separate optional account identity for future purchases and cloud sync.
 * The anonymous Browser AI, image editor and local files still work.
 * Start with email + password; Google OAuth requires external provider
 * registration, redirect URL/domain configuration and admin review.
 */
export const auth = defineAuth({
  loginWith: { email:true },
});
