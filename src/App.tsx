/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Suspense, useEffect, useState } from 'react';
import { Navigate, useLocation, useRoutes } from 'react-router-dom';
import { useLocalStorageState } from 'ahooks';
import Layout from './layout';
import defaultConfig from '../config.json';
import type { TranslateConfig } from './modules/translate/types';
import { DEFAULT_OUTPUT_FILE_FORMAT } from './common/file-format';
import {
  hasAuthSession,
  initializeAuthSession,
  subscribeToAuthSession,
} from './modules/auth/session';
//@ts-expect-error
import routes from '@@react-pages';
import './App.css';

const normalizeLanguageTag = (tag: string): string => tag.replace('_', '-');

const migrateConfig = (input?: TranslateConfig): TranslateConfig => {
  const cleanInput = { ...(input || {}) } as TranslateConfig & Record<string, unknown>;
  ['apiUrl', 'apiKey', 'model', 'temperature', 'max_tokens'].forEach((key) => {
    delete cleanInput[key];
  });
  const merged = {
    ...(defaultConfig as TranslateConfig),
    ...cleanInput,
    file: {
      ...(defaultConfig as TranslateConfig).file,
      ...(cleanInput.file || {}),
      languageFileNameMap: {
        ...(defaultConfig as TranslateConfig).file.languageFileNameMap,
        ...(cleanInput.file?.languageFileNameMap || {}),
      },
    },
  };

  merged.file.sourceLanguage = normalizeLanguageTag(merged.file.sourceLanguage);
  merged.file.outputFileFormat = merged.file.outputFileFormat || DEFAULT_OUTPUT_FILE_FORMAT;
  merged.file.languageFileNameRule = merged.file.languageFileNameRule || 'hyphen';

  merged.file.languageFileNameMap = Object.entries(merged.file.languageFileNameMap || {}).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      acc[normalizeLanguageTag(key)] = value;
      return acc;
    },
    {},
  );
  return merged;
};

function App() {
  const [config, setConfig] = useLocalStorageState<TranslateConfig>('config');
  const [isAuthenticated, setIsAuthenticated] = useState(hasAuthSession);
  const location = useLocation();

  useEffect(() => {
    setConfig(migrateConfig(config));
  }, []);

  useEffect(() => {
    const disposeSession = initializeAuthSession();
    return disposeSession;
  }, []);

  useEffect(() => subscribeToAuthSession(() => setIsAuthenticated(hasAuthSession())), []);

  const page = useRoutes(routes);
  if (location.pathname === '/login') return <Suspense fallback={<p>Loading...</p>}>{page}</Suspense>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Layout>{page}</Layout>
    </Suspense>
  );
}

export default App;
