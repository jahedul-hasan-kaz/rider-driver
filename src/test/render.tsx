import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/theme/theme';
import { SheetProvider, ToastProvider } from '@/ui';

// Renders a screen with the providers the app root gives it: query cache (no retries), theme, safe area, toasts
// and sheets. Returns the query client so a test can seed or inspect server state.
export async function renderScreen(ui: ReactElement, client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
  const view = await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider initialMode="light">
          <ToastProvider>
            <SheetProvider>{ui}</SheetProvider>
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
