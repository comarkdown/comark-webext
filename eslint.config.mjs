import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: [
      // real-world GitHub fixtures, kept verbatim
      'src/tests/fixtures/**',
    ],
  },
)
