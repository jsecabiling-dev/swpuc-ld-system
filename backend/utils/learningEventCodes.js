// Database codes are stable; API labels remain compatible with existing clients.
const DELIVERY_CODES = Object.freeze({ In_Person: 1, Online: 2, Hybrid: 3 });
const STATUS_CODES = Object.freeze({ Submitted: 1, 'For evaluation': 2, Approved: 3, Rejected: 4 });

function labelSql(column, codes) {
    return `CASE ${column} ${Object.entries(codes).map(([label, code]) => `WHEN ${code} THEN '${label}'`).join(' ')} END`;
}

module.exports = {
    DELIVERY_CODES,
    STATUS_CODES,
    deliveryLabelSql: (column) => labelSql(column, DELIVERY_CODES),
    statusLabelSql: (column) => labelSql(column, STATUS_CODES),
};
