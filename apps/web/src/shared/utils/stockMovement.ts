type StockMovementWithQuantity = {
  quantity: string | number;
};

export function getNetStockWriteOffQuantity(movements?: StockMovementWithQuantity[]) {
  const netMovement = (movements ?? []).reduce((total, movement) => total + Number(movement.quantity), 0);
  return Math.max(-netMovement, 0);
}
