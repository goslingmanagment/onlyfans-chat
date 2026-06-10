declare module '*.css';

type PreloadApi = import('../../preload/index').PreloadApi;

interface Window {
  chatgoose: PreloadApi;
}
