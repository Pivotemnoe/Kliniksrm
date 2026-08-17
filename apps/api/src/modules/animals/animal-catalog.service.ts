import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnimalCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listCatalog() {
    const species = await this.prisma.animalSpecies.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      include: {
        breeds: {
          orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        },
      },
    });

    return { species };
  }

  async validateSelection(speciesTitle?: string | null, breedTitle?: string | null) {
    const species = speciesTitle?.trim();
    const breed = breedTitle?.trim();

    if (!species) {
      throw new BadRequestException('Выберите вид животного');
    }

    if (!breed) {
      throw new BadRequestException('Выберите породу');
    }

    const catalogSpecies = await this.prisma.animalSpecies.findFirst({
      where: { title: species },
      select: { id: true },
    });

    if (!catalogSpecies) {
      throw new BadRequestException('Выберите вид животного из реестра');
    }

    // Порода может быть внесена со слов владельца и не обязана быть в реестре.
  }
}
