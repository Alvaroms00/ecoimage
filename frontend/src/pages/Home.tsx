import { useNavigate } from "react-router-dom";
import ImageSelector from "../components/ImageSelector";

export default function Home() {
  const navigate = useNavigate();

  const handleImageSelected = (_file: File, dataUrl: string) => {
    navigate("/canvas", { state: { dataUrl } });
  };

  return <ImageSelector onImageSelected={handleImageSelected} />;
}
