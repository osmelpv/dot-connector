// Pure transformations of validated drafts. No files, runtime or authority.
import {z} from 'zod';
import {createPlan, validatePlan, profileFolderSchema} from './configurator.mjs';

const label = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
export const duplicateProfileSchema = z.object({
  schemaVersion: z.literal(1),
  from: label,
  name: label,
  folder: profileFolderSchema
}).strict();

export function listProfiles(plan) {
  validatePlan(plan);
  return {
    kind: 'profile-list',
    machineId: plan.intent.machineId,
    digest: plan.digest,
    approval: 'pending',
    executable: false,
    profiles: plan.intent.profiles.map((profile, index) => {
      const assessment = plan.assessment.profiles[index];
      return structuredClone({
        ...profile,
        available: false,
        folderVerified: false,
        terminalInput: false,
        isolation: assessment.isolation,
        blockers: assessment.blockers
      });
    })
  };
}

export function duplicateProfile(plan, options) {
  validatePlan(plan);
  const parsed = duplicateProfileSchema.safeParse(options);
  if (!parsed.success) throw Error('CONFIGURATOR_INVALID_PROFILE_OPTIONS');
  const {from, name, folder} = parsed.data;
  const source = plan.intent.profiles.find(profile => profile.profileId === from);
  if (!source) throw Error('CONFIGURATOR_PROFILE_NOT_FOUND');
  if (plan.intent.profiles.length >= 8) throw Error('CONFIGURATOR_PROFILE_LIMIT');

  // Deliberately construct the new profile instead of spreading the source.
  // Only its mode is reusable; neither requested access nor destination is copied.
  const copy = {
    profileId: name,
    mode: source.mode,
    folder,
    destination: {kind: 'local', id: 'local-preview'},
    permissions: {read_files: false, modify_files: false, execute: false, read_output: false}
  };
  const result = createPlan({
    schemaVersion: 1,
    machineId: plan.intent.machineId,
    profiles: [...structuredClone(plan.intent.profiles), copy]
  });
  validatePlan(result);
  return result;
}
