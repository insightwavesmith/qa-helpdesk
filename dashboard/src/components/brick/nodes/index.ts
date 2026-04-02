import { BlockNode } from './BlockNode';
import { ReviewNode } from './ReviewNode';
import { NotifyNode } from './NotifyNode';
import { StartNode } from './StartNode';
import { EndNode } from './EndNode';

export const brickNodeTypes = {
  block: BlockNode,
  review: ReviewNode,
  notify: NotifyNode,
  start: StartNode,
  end: EndNode,
};
