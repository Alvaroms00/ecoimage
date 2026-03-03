import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import ImageCanvas from "./components/ImageCanvas";
import ImageSelector from "./components/ImageSelector";
import { BASENAME } from "./lib/env";

function ImageSelectorWrapper() {
  const navigate = useNavigate();
  const handleImageSelected = (_file: File, dataUrl: string) => {
    navigate("/canvas", { state: { dataUrl } });
  };
  return <ImageSelector onImageSelected={handleImageSelected} />;
}

function App() {
  return (
    <BrowserRouter basename={BASENAME}>
      <Routes>
        {/* raíz: selector / home */}
        <Route path="/" element={<ImageSelectorWrapper />} />
        <Route path="/canvas" element={<ImageCanvas />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
