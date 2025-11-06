declare module "dom-to-image-more" {
  type Filter = (node: HTMLElement) => boolean;

  interface Options {
    bgcolor?: string;
    width?: number;
    height?: number;
    style?: Partial<CSSStyleDeclaration>;
    quality?: number;
    filter?: Filter;
    cacheBust?: boolean;
    imagePlaceholder?: string;
    useCORS?: boolean;
  }

  interface DomToImage {
    toPng(node: Node, options?: Options): Promise<string>;
    toJpeg(node: Node, options?: Options): Promise<string>;
    toSvg(node: Node, options?: Options): Promise<string>;
    toBlob(node: Node, options?: Options): Promise<Blob>;
  }

  const domtoimage: DomToImage;
  export default domtoimage;
}