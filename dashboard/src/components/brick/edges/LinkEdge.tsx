import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import type { LinkEdgeData, LinkType } from '../nodes/types';

interface LinkStyleConfig {
  pathFn: 'smoothstep' | 'bezier' | 'step';
  strokeDasharray?: string;
  color: string;
  label: string;
}

function getLinkStyleConfig(data: LinkEdgeData): LinkStyleConfig {
  const t = data.linkType;
  switch (t) {
    case 'sequential':
      return { pathFn: 'smoothstep', color: '#6B7280', label: '' };
    case 'parallel':
      return { pathFn: 'smoothstep', color: '#3B82F6', label: '∥' };
    case 'compete':
      return {
        pathFn: 'bezier',
        strokeDasharray: '5 5',
        color: '#F97316',
        label: data.judge ? `⚔ ${data.judge}` : '⚔',
      };
    case 'loop':
      return {
        pathFn: 'smoothstep',
        color: '#8B5CF6',
        label: data.condition ? `↻ ${data.condition}` : '↻',
      };
    case 'cron':
      return {
        pathFn: 'smoothstep',
        strokeDasharray: '5 5',
        color: '#9CA3AF',
        label: data.cron ? `⏰ ${data.cron}` : '⏰',
      };
    case 'branch':
      return {
        pathFn: 'bezier',
        color: '#10B981',
        label: data.condition ? `⑂ ${data.condition}` : '⑂',
      };
    default:
      return { pathFn: 'smoothstep', color: '#6B7280', label: '' };
  }
}

function getStepPath(props: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: EdgeProps['sourcePosition'];
  targetPosition: EdgeProps['targetPosition'];
}) {
  // step uses smoothstep with borderRadius=0
  return getSmoothStepPath({
    ...props,
    borderRadius: 0,
  });
}

export function LinkEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    style: externalStyle,
  } = props;

  const edgeData = (data ?? { linkType: 'sequential' }) as LinkEdgeData;
  const config = getLinkStyleConfig(edgeData);
  const isActive = edgeData.isActive === true;

  const pathParams = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition };

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (config.pathFn === 'bezier') {
    const [path, lx, ly] = getBezierPath(pathParams);
    edgePath = path;
    labelX = lx;
    labelY = ly;
  } else if (config.pathFn === 'step') {
    const [path, lx, ly] = getStepPath(pathParams);
    edgePath = path;
    labelX = lx;
    labelY = ly;
  } else {
    const [path, lx, ly] = getSmoothStepPath(pathParams);
    edgePath = path;
    labelX = lx;
    labelY = ly;
  }

  const edgeStyle: React.CSSProperties = {
    stroke: config.color,
    strokeWidth: 2,
    ...(config.strokeDasharray ? { strokeDasharray: config.strokeDasharray } : {}),
    ...(isActive
      ? {
          strokeDasharray: '10 5',
          animation: 'dash-flow 1s linear infinite',
        }
      : {}),
    ...externalStyle,
  };

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={edgeStyle} />
      {config.label && (
        <EdgeLabelRenderer>
          <div
            data-testid="edge-label"
            className="absolute text-xs font-medium px-1.5 py-0.5 rounded bg-white shadow-sm border border-gray-200 pointer-events-none"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              color: config.color,
            }}
          >
            {config.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
