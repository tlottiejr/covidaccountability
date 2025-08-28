// functions/api/states.js
export async function onRequestGet() {
  const states = [
    // Minimal sample. Add all states here or wire to your store.
    { code: "AL", name: "Alabama", link: "https://www.albme.gov/forms/complaint-form", unavailable: false },
    { code: "AK", name: "Alaska",  link: "https://www.akmdboard.org/complaints",         unavailable: false },
    // …
  ];

  return new Response(JSON.stringify(states), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
