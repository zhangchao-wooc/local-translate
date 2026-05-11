const WINDOWS_PATH = /^[A-Za-z]:\\/;

export const normalizePath = (path: string): string => {
  if (!path) return '';
  return path.replace(/\\+/g, '/').replace(/\/+/g, '/');
};

export const getPathStyle = (path: string): 'windows' | 'posix' => {
  if (WINDOWS_PATH.test(path) || path.includes('\\')) {
    return 'windows';
  }
  return 'posix';
};

export const joinPath = (dir: string, fileName: string): string => {
  const style = getPathStyle(dir);
  if (style === 'windows') {
    return `${dir.replace(/[\\/]+$/, '')}\\${fileName}`;
  }
  return `${dir.replace(/[\\/]+$/, '')}/${fileName}`;
};
