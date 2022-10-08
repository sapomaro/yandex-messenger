import {EventBus} from './EventBus';
import {Templator} from './Templator';
import {rand, objIntersect} from './Utils';

const uids: Record<string, boolean> = {};

const generateUid = () => {
  let uid = '';
  let num: number;
  let num2: number;
  do {
    num = rand(1, 99999);
    num2 = rand(1, 99999);
    uid = `pp_${num}_${num2}_uid`;
  } while (uids[uid]);
  uids[uid] = true;
  return uid;
};

const instancesOfBlock: Record<string, Block> = {};

type BlockNodes = DocumentFragment | HTMLElement | ChildNode;

type Fn = (...args: Array<unknown>) => void;
type RenderFn = (props?: Record<string, unknown>) => string;
type EventAttachment = {
  node: HTMLElement;
  eventType: string;
  callback: Fn;
};

export class Block {
  static EVENTS = {
    PREPARE: 'preparing',
    RENDER: 'rendered',
    MOUNT: 'mounted',
    UPDATE: 'updated',
  };

  private blockuid: string;
  private templator: Templator;
  public listeners: Record<string, unknown>;
  private nativeEventsList: Array<Record<string, unknown>>;
  private element: BlockNodes;
  public listEvents: Fn;
  public on: Fn;
  public off: Fn;
  public fire: Fn;
  public props: Record<string, unknown>;

  constructor(props: Record<string, unknown> = {}) {
    this.props = props;
    this.blockuid = generateUid();
    instancesOfBlock[this.blockuid] = this;
    this.templator = new Templator(this.props);
    this.registerEvents();
  }

  registerEvents(): void {
    this.on = EventBus.on;
    this.off = EventBus.off;
    this.fire = EventBus.fire;
    this.listEvents = EventBus.listEvents;
    this.listeners = {};

    this.nativeEventsList = [];
    this.on(Block.EVENTS.UPDATE, () => {
      this.replaceMultipleNodes(`[data-blockuid=${this.blockuid}]`, [this]);
    });
    this.on('eventAttached', (data: EventAttachment) => {
      this.nativeEventsList.push(data);
    });
    this.on(Block.EVENTS.PREPARE, () => {
      for (const {node, eventType, callback} of this.nativeEventsList) {
        if (typeof node === 'object' && node instanceof HTMLElement) {
          node.removeEventListener(eventType as string,
            callback as EventListener);
        }
      }
      this.nativeEventsList = [];
      this.listDescendants((block: Block) => {
        block.fire(Block.EVENTS.PREPARE);
      });
    });
  }

  setProps(obj: Record<string, unknown>): void {
    if (!objIntersect(this.props, obj)) {
      Object.assign(this.props, obj);
      this.fire(Block.EVENTS.UPDATE);
    }
  }

  refresh(): void {
    this.fire(Block.EVENTS.UPDATE);
  }

  isInDOM(): boolean {
    return document.querySelector(`[data-blockuid=${this.blockuid}]`) !== null;
  }

  getContent(): NodeList {
    return document.querySelectorAll(`[data-blockuid=${this.blockuid}]`) ||
      this.element;
  }

  listDescendants(callback: Fn): void {
    const elementNodes = this.getContent();
    if (!elementNodes) {
      return;
    }
    for (const node of elementNodes) {
      if (node instanceof HTMLElement) {
        const nestedElementNodes = node.querySelectorAll('[data-blockuid]');
        for (const nestedNode of nestedElementNodes) {
          if (nestedNode instanceof HTMLElement &&
              nestedNode.dataset && nestedNode.dataset.blockuid) {
            const block: Block = instancesOfBlock[nestedNode.dataset.blockuid];
            if (block) {
              callback(block);
            }
          }
        }
      }
    }
  }

  build(): BlockNodes {
    this.fire(Block.EVENTS.PREPARE);
    this.element = this.buildNode(this.render, this.props,
        (node: HTMLElement) => {
          if (node.nodeType === 1) {
            node.setAttribute('data-blockuid', this.blockuid);
          }
        });
    // traverse using local context of the block
    this.traverseChildren(this.element);
    this.fire(Block.EVENTS.RENDER);
    return this.element;
  }

  public render(props?: Record<string, unknown>): string {
    return `${props?.value}`;
  }

  buildNode(renderer: RenderFn,
      props: Record<string, unknown> | undefined = {},
      callback: Fn | null = null) {
    const elementHolder: HTMLElement = document.createElement('DIV');
    elementHolder.innerHTML = renderer(props).trim();

    const fragment: DocumentFragment = document.createDocumentFragment();
    while (elementHolder.childNodes.length !== 0) {
      const node: BlockNodes = elementHolder.childNodes[0];
      if (callback) {
        callback(node);
      }
      fragment.appendChild(node);
    }
    return fragment;
  }

  replaceMultipleNodes(selector: string, assets: Array<Block>): void {
    const nodeList: NodeList = document.querySelectorAll(selector);
    if (nodeList && nodeList.length) {
      for (let i = nodeList.length - 1; i > 0; --i) {
        nodeList[i].parentNode?.removeChild(nodeList[i]);
      }
      this.replaceNode(nodeList[0] as HTMLElement, assets);
    }
  }

  resolveNode(asset: unknown): BlockNodes {
    let elem: BlockNodes = document.createTextNode('');
    if (typeof asset === 'string') {
      elem = document.createTextNode(asset);
    } else if (typeof asset === 'function') {
      elem = this.buildNode(asset as RenderFn);
      this.traverseChildren(elem);
    } else if (typeof asset === 'object' && asset instanceof Block) {
      elem = asset.build();
      // traverse using context of the parent
      this.traverseChildren(elem);
    } else if (typeof asset === 'object' && asset instanceof HTMLElement) {
      elem = asset;
      this.traverseChildren(elem);
    }
    return elem;
  }

  replaceNode(node: BlockNodes, assets: Array<unknown>): void {
    const fragment: DocumentFragment = document.createDocumentFragment();
    const blocksList: Array<Block> = [];
    for (const asset of assets) {
      if (typeof asset === 'object' && asset instanceof Block) {
        blocksList.push(asset);
      }
      const elem = this.resolveNode(asset);
      fragment.appendChild(elem);
    }
    fragment.normalize();
    node.parentNode?.replaceChild(fragment, node);
    for (const block of blocksList) {
      if (block.isInDOM()) {
        block.fire(Block.EVENTS.MOUNT);
      }
    }
  }

  traverseText(node: BlockNodes): void {
    const assets: Array<unknown> = this.templator.resolve(node.textContent);
    if (!(assets.length === 1 && assets[0] === node.textContent)) {
      this.replaceNode(node, assets);
    }
  }

  traverseChildren(node: BlockNodes): void {
    if (!(node instanceof Node) || !node.childNodes) {
      return;
    }
    for (let i = node.childNodes.length - 1; i >= 0; --i) {
      if (node.childNodes[i].nodeType === 1) {
        this.traverseAttributes(node.childNodes[i] as HTMLElement);
        this.traverseChildren(node.childNodes[i]);
      } else if (node.childNodes[i].nodeType === 3 &&
                 node instanceof HTMLElement &&
                 node.tagName && node.tagName !== 'SCRIPT') {
        this.traverseText(node.childNodes[i]);
      }
    }
  }

  traverseAttributes(node: HTMLElement): void {
    for (let i = node.attributes.length - 1; i >= 0; --i) {
      const attrName: string = node.attributes[i].nodeName ?? '';
      const attrValue: string = node.attributes[i].nodeValue ?? '';
      if (attrName.slice(0, 2) === 'on') { // event attachment
        const [asset]: Array<unknown> = this.templator.resolve(attrValue);
        if (typeof asset === 'function') {
          const callback = asset;
          const eventType: string = attrName.slice(2);
          node.addEventListener(eventType, callback as EventListener);
          node.removeAttribute(attrName);
          this.fire('eventAttached', {node, eventType, callback});
        }
      } else {
        const [asset]: Array<unknown> = this.templator.resolve(attrValue);
        if (typeof asset === 'string' && asset !== attrValue) {
          node.setAttribute(attrName, asset);
        }
      }
    }
  }

  renderToBody(): void {
    EventBus.on('load', () => {
      this.traverseChildren(document.head);
      document.body.innerHTML = '';
      const elem = this.build();
      // traverse using global context of the app
      this.traverseChildren(elem);
      document.body.appendChild(elem);

      this.fire(Block.EVENTS.MOUNT);
      this.listDescendants((block: Block) => {
        block.fire(Block.EVENTS.MOUNT);
      });
    });
  }
}

