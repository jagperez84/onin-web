export function validateEmail(value:string):string|null{
  if(!value.trim()) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? null : 'El email no tiene un formato válido.';
}
export function validatePhone(value:string):string|null{
  if(!value.trim()) return null;
  const normalized=value.replace(/[\s().-]/g,'');
  return /^\+?\d{8,15}$/.test(normalized) ? null : 'El teléfono no tiene un formato válido.';
}
export function validateSpanishTaxId(value:string):string|null{
  const raw=value.trim().toUpperCase();
  if(!raw) return 'El CIF/NIF es obligatorio.';
  const dni=/^[0-9]{8}[A-Z]$/;
  const nie=/^[XYZ][0-9]{7}[A-Z]$/;
  const cif=/^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/;
  if(!dni.test(raw)&&!nie.test(raw)&&!cif.test(raw)) return 'El CIF/NIF no tiene un formato válido.';
  if(dni.test(raw)){
    const letters='TRWAGMYFPDXBNJZSQVHLCKE';
    if(letters[parseInt(raw.slice(0,8),10)%23]!==raw[8]) return 'El NIF no es válido.';
  }
  if(nie.test(raw)){
    const letters='TRWAGMYFPDXBNJZSQVHLCKE';
    const prefix={X:'0',Y:'1',Z:'2'}[raw[0] as 'X'|'Y'|'Z'];
    if(letters[parseInt(prefix+raw.slice(1,8),10)%23]!==raw[8]) return 'El NIE no es válido.';
  }
  return null;
}
