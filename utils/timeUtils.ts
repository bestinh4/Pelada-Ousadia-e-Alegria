
export const isLateRemovalTime = () => {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const hour = now.getHours();

  // Se for Sábado (6) e depois das 18h (18)
  if (day === 6 && hour >= 18) {
    return true;
  }
  
  // Se for Domingo (0) - assumindo que a pelada é no fim de semana
  if (day === 0) {
    return true;
  }

  return false;
};
