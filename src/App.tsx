/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Suspense, useEffect } from 'react';
import { useRoutes } from 'react-router-dom';
import { useLocalStorageState } from 'ahooks';
import Layout from './layout';
import defaultConfig from '../config.json';
import type { TranslateConfig } from './modules/translate/types';
//@ts-expect-error
import routes from '@@react-pages';
import './App.css';

const normalizeLanguageTag = (tag: string): string => tag.replace('_', '-');

const migrateConfig = (input?: TranslateConfig): TranslateConfig => {
  const merged = {
    ...(defaultConfig as TranslateConfig),
    ...(input || {}),
    file: {
      ...(defaultConfig as TranslateConfig).file,
      ...(input?.file || {}),
      languageFileNameMap: {
        ...(defaultConfig as TranslateConfig).file.languageFileNameMap,
        ...(input?.file?.languageFileNameMap || {}),
      },
    },
  };

  merged.file.sourceLanguage = normalizeLanguageTag(merged.file.sourceLanguage);
  merged.file.targetLanguage = normalizeLanguageTag(merged.file.targetLanguage);
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

  useEffect(() => {
    setConfig(migrateConfig(config));
  }, []);

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Layout>{useRoutes(routes)}</Layout>
    </Suspense>
  );
}

export default App;
