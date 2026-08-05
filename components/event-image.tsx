import Image from "next/image";
import type { CSSProperties } from "react";

type EventImageProps = {
  src: string;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
  objectFit?: CSSProperties["objectFit"];
  objectPosition?: CSSProperties["objectPosition"];
};

export function EventImage({ src, alt, fill, width, height, sizes, priority, className, style, objectFit = "cover", objectPosition = "center" }: EventImageProps) {
  const isRemote = /^https?:\/\//i.test(src);

  if (isRemote) {
    const remoteStyle: CSSProperties = fill
      ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit, objectPosition, ...style }
      : { width, height, objectFit, objectPosition, ...style };
    return (
      // Remote Supabase Storage hostnames differ per project, so render trusted admin-provided URLs directly.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        className={className}
        style={remoteStyle}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      sizes={sizes}
      priority={priority}
      className={className}
      style={{ objectFit, objectPosition, ...style }}
    />
  );
}
