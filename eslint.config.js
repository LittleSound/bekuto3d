import antfu from '@antfu/eslint-config'

export default antfu(
  {
    unocss: true,
    formatters: true,
    rules: {
      'no-cond-assign': 'off',
      'no-sequences': 'off',
    },
  },
  {
    files: ['pnpm-workspace.yaml'],
    rules: {
      // Drop the preset's `minimumReleaseAgeExcludePrune`: it is a no-op without a `minimumReleaseAgeExclude` list
      'pnpm/yaml-enforce-settings': ['error', {
        settings: {
          shellEmulator: true,
          trustPolicy: 'no-downgrade',
        },
      }],
    },
  },
)
