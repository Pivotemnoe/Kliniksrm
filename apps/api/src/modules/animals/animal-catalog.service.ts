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

    const catalogBreed = await this.prisma.animalBreed.findFirst({
      where: {
        title: breed,
        species: { title: species },
      },
      select: { id: true },
    });

    if (!catalogBreed) {
      throw new BadRequestException('Порода не относится к выбранному виду животного');
    }
  }
}
