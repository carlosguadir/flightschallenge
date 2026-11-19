export class BookingWriteConflict extends Error {
  constructor(
    public readonly constraint: string | undefined,
    public override readonly cause?: unknown,
  ) {
    super('Booking write conflict');
    this.name = 'BookingWriteConflict';
  }
}
