import { useEffect, useState, type FormEvent } from 'react';
import { send } from '@/lib/messages';
import { EMPTY_IDENTITY, type Identity } from '@/lib/types';
import { Field, Input, ScreenHeader, useToast } from '../ui';

const GROUPS: { title: string; fields: [keyof Identity, string, string?][] }[] = [
  { title: 'Personal', fields: [['givenName', 'First name', 'half'], ['familyName', 'Last name', 'half'], ['email', 'Email'], ['phone', 'Phone'], ['organization', 'Company']] },
  { title: 'Address', fields: [['street', 'Street'], ['city', 'City', 'half'], ['postalCode', 'Postal code', 'half'], ['region', 'State', 'half'], ['country', 'Country', 'half']] },
];

export function IdentityView({ onBack }: { onBack: () => void }) {
  const [id, setId] = useState<Identity>(EMPTY_IDENTITY);
  const toast = useToast();
  useEffect(() => {
    send('identity:get', {}).then((r) => r.identity && setId({ ...EMPTY_IDENTITY, ...r.identity }));
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const fullName = id.fullName || [id.givenName, id.familyName].filter(Boolean).join(' ');
    await send('identity:set', { identity: { ...id, fullName } });
    toast('Profile saved');
    onBack();
  };

  return (
    <form onSubmit={save} className="fade-in">
      <ScreenHeader
        title="Autofill profile"
        onBack={onBack}
        action={<button className="btn btn-primary mr-1 h-8">Save</button>}
      />
      <p className="px-4 pb-3 text-xs text-muted">Encrypted in your vault. Used for name, contact and address forms.</p>
      {GROUPS.map((g) => (
        <section key={g.title} className="px-4 pb-5">
          <h3 className="mb-2 text-[11px] font-medium text-faint">{g.title}</h3>
          <div className="grid grid-cols-2 gap-3">
            {g.fields.map(([k, label, half]) => (
              <div key={k} className={half ? '' : 'col-span-2'}>
                <Field label={label}>
                  <Input value={id[k]} onChange={(e) => setId({ ...id, [k]: e.target.value })} />
                </Field>
              </div>
            ))}
          </div>
        </section>
      ))}
    </form>
  );
}
