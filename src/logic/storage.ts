import { useWebExtensionStorage } from '~/composables/useWebExtensionStorage'

export const { data: comarkEnabled, dataReady: comarkEnabledReady } = useWebExtensionStorage('comark-enabled', true)
