import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M9.5 21v-6h5v6" />
  </Base>
);

export const FaceIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="8.5" r="4" />
    <path d="M4.5 20c1.5-3.2 4.2-5 7.5-5s6 1.8 7.5 5" />
  </Base>
);

export const CameraIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 5h2l1.2-2h5.6L16 5h2a2.5 2.5 0 0 1 2.5 2.5V17A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17V7.5A2.5 2.5 0 0 1 6 5Z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </Base>
);

export const VolumeIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M11 5 6 9H3v6h3l5 4V5Z" />
    <path d="M15.5 9a4 4 0 0 1 0 6" />
    <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
  </Base>
);

export const RepeatIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 4v5h-5" />
  </Base>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m15 6-6 6 6 6" />
  </Base>
);

export const SparkleIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" />
    <path d="M19 17.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
  </Base>
);

export const CalendarIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </Base>
);

export const HeartIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3.4 1-4.5 2.5C10.9 4 9.3 3 7.5 3A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z" />
  </Base>
);

export const ImageIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="M21 15.5l-5-5L5 21" />
  </Base>
);

export const CloseIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);

export const CheckIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 12.5l5 5L20 6.5" />
  </Base>
);

export const PencilIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1 1-4L16.5 4.5Z" />
  </Base>
);

export const PlusIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const AgentIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M20.5 11.5a7.5 7.5 0 0 1-7.5 7.5H9l-4.5 3 .8-4A7.5 7.5 0 1 1 20.5 11.5Z" />
    <path d="M12 8.4l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8Z" />
  </Base>
);

export const MicIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
    <path d="M12 18v3M8.5 21h7" />
  </Base>
);

export const MicOffIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M15 6.5V11a3 3 0 0 1-4.4 2.6" />
    <path d="M9 9.5V6a3 3 0 0 1 5.6-1.5" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 10.3 5.3" />
    <path d="M18.5 11.5a6.5 6.5 0 0 1-.6 2.7" />
    <path d="M12 18v3M8.5 21h7M4 4l16 16" />
  </Base>
);

export const TrashIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Base>
);

export const CropIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 2v14a2 2 0 0 0 2 2h14" />
    <path d="M18 22V8a2 2 0 0 0-2-2H2" />
  </Base>
);

export const RotateIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
    <path d="M21 3.5V9h-5.5" />
  </Base>
);

export const FlipIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3v18" />
    <path d="M8.5 7 4 12l4.5 5V7Z" />
    <path d="M15.5 7 20 12l-4.5 5V7Z" />
  </Base>
);

export const DownloadIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3v12" />
    <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <path d="M4 20h16" />
  </Base>
);