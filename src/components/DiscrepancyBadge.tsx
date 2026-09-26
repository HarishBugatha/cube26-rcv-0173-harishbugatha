import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  XCircle,
  HelpCircle,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { ReceivingStatus } from '../types/receiving';

interface DiscrepancyBadgeProps {
  status: ReceivingStatus;
  size?: 'sm' | 'md' | 'lg';
}

export const DiscrepancyBadge: React.FC<DiscrepancyBadgeProps> = ({
  status,
  size = 'md',
}) => {
  const iconSize = size === 'sm' ? 12 : size === 'lg' ? 18 : 14;

  switch (status) {
    case 'MATCHED':
      return (
        <span className="badge badge-matched" role="status" aria-label="Status: Matched 100%">
          <CheckCircle2 size={iconSize} />
          MATCHED
        </span>
      );
    case 'SHORT_RECEIVED':
      return (
        <span className="badge badge-short" role="status" aria-label="Status: Short Received">
          <TrendingDown size={iconSize} />
          SHORT RECEIVED
        </span>
      );
    case 'OVER_RECEIVED':
      return (
        <span className="badge badge-over" role="status" aria-label="Status: Over Received">
          <TrendingUp size={iconSize} />
          OVER RECEIVED
        </span>
      );
    case 'WRONG_PRODUCT':
      return (
        <span className="badge badge-wrong" role="status" aria-label="Status: Wrong Product / SKU Mismatch">
          <XCircle size={iconSize} />
          WRONG SKU
        </span>
      );
    case 'DAMAGED':
      return (
        <span className="badge badge-damaged" role="status" aria-label="Status: Physical Damage Detected">
          <ShieldAlert size={iconSize} />
          DAMAGED
        </span>
      );
    case 'QUALITY_DISCREPANCY':
      return (
        <span className="badge badge-quality" role="status" aria-label="Status: Quality Spec Discrepancy">
          <AlertTriangle size={iconSize} />
          QUALITY FLAG
        </span>
      );
    case 'UNCERTAIN':
      return (
        <span className="badge badge-uncertain" role="status" aria-label="Status: Uncertain Judgment">
          <HelpCircle size={iconSize} />
          UNCERTAIN
        </span>
      );
    case 'PENDING_REVIEW':
    default:
      return (
        <span className="badge badge-pending" role="status" aria-label="Status: Pending Review">
          <Clock size={iconSize} />
          PENDING REVIEW
        </span>
      );
  }
};
