export const onRequest = async () => {
  const list = [
    { code: 'MI', name: 'Michigan',  url: 'https://www.michigan.gov/lara/bureau-list/bpl/complaints' },
    { code: 'WI', name: 'Wisconsin', url: 'https://dsps.wi.gov/Pages/SelfService/ComplaintSubmittal.aspx' }
  ];
  return Response.json(list);
};
