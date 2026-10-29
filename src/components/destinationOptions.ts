import type { MemoryDestination } from "../data/memoryStore";
import { FaceIcon, HomeIcon, ImageIcon } from "./icons";

/** The places a photo can be kept, shared by the camera flow and edit forms. */
export const DESTINATION_OPTIONS: {
  id: MemoryDestination;
  label: string;
  hint: string;
  icon: typeof HomeIcon;
}[] = [
  { id: "home", label: "Home", hint: "Your memory library", icon: HomeIcon },
  { id: "faces", label: "Who is this?", hint: "A person's photo page", icon: FaceIcon },
  { id: "stories", label: "Stories", hint: "A photo story", icon: ImageIcon },
];