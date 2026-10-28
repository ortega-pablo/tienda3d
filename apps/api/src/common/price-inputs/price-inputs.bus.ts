import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

/**
 * Aviso de que cambió algo que entra en el precio de un producto (plan F7·2,
 * lista de §4.3). Lo emite el interceptor; lo escucha el recálculo de los
 * precios web, sin que los módulos de costos dependan de la tienda.
 */
@Injectable()
export class PriceInputsBus {
  private readonly subject = new Subject<string>();
  readonly changes$ = this.subject.asObservable();

  changed(cause: string): void {
    this.subject.next(cause);
  }
}
