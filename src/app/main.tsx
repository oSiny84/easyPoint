import { createRoot } from 'react-dom/client';
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/700.css';
import '@fontsource/jua/400.css';
import '@fontsource/do-hyeon/400.css';
import '@fontsource/gamja-flower/400.css';
import '@fontsource/nanum-pen-script/400.css';
import '@fontsource/gaegu/400.css';
import '@fontsource/gaegu/700.css';
import '../styles/app.css';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';

createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>);
