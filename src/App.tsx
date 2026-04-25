import { Route, Routes } from 'react-router-dom';
import { Home } from '@/routes/Home';
import { ThemeProvider } from '@/components/waymarks/ThemeProvider';

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </ThemeProvider>
  );
}
