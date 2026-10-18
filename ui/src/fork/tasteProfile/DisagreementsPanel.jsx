/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Empty, Table, TabPane, Tabs } from '@douyinfe/semi-ui-19';

import { SegmentPart } from '../../components/segment/SegmentPart';
import { forkT } from '../i18n.js';
import { getFeedback } from '../forkApi.js';

const KINDS = ['rejectedGems', 'acceptedBelow'];

/**
 * Where the user's verdict and Claude's score disagree: rejected Gems, and listings accepted
 * although they scored below the threshold. The strongest signal for refining the profile.
 *
 * @returns {React.ReactElement}
 */
export default function DisagreementsPanel() {
  const [kind, setKind] = useState(KINDS[0]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getFeedback(kind)
      .then((data) => !cancelled && setRows(data))
      .catch(() => !cancelled && setRows([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const columns = [
    {
      title: forkT('disagreements.colListing'),
      dataIndex: 'title',
      render: (title, row) => <Link to={`/listings/listing/${row.id}`}>{title}</Link>,
    },
    {
      title: forkT('disagreements.colScore'),
      dataIndex: 'score',
      width: 90,
      render: (score, row) => `${score}/10 (≥${row.gemThreshold})`,
    },
    { title: forkT('disagreements.colReasoning'), dataIndex: 'reasoning' },
    { title: forkT('disagreements.colReason'), dataIndex: 'reason', render: (reason) => reason ?? '–' },
  ];

  return (
    <SegmentPart name={forkT('disagreements.title')} helpText={forkT('disagreements.help')}>
      <Tabs activeKey={kind} onChange={setKind} type="line">
        {KINDS.map((key) => (
          <TabPane key={key} itemKey={key} tab={forkT(`disagreements.${key}`)} />
        ))}
      </Tabs>
      <Table
        pagination={false}
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        empty={<Empty description={forkT('disagreements.empty')} />}
      />
    </SegmentPart>
  );
}
