export interface IdGenerator {
  uuid(): string;
  bookingCode(): string;
}

export const ID_GENERATOR = Symbol('ID_GENERATOR');
