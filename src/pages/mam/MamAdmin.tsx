import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MamSectionsTab from "@/components/mam/MamSectionsTab";
import MamCategoryGroupsTab from "@/components/mam/MamCategoryGroupsTab";
import MamCategoriesTab from "@/components/mam/MamCategoriesTab";
import MamBrandsTab from "@/components/mam/MamBrandsTab";
import MamModelsTab from "@/components/mam/MamModelsTab";
import MamCategoryAttributesTab from "@/components/mam/MamCategoryAttributesTab";
import MamPoolCategoriesTab from "@/components/mam/MamPoolCategoriesTab";
import MamCoopStructureTab from "@/components/mam/MamCoopStructureTab";
import MamProjectionAssumptionsTab from "@/components/mam/MamProjectionAssumptionsTab";

const MamAdmin = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Asset Manager Setup</h1>
      <p className="text-muted-foreground">Manage sections, categories, brands, models and configuration.</p>
    </div>

    <Tabs defaultValue="sections" className="w-full">
      <TabsList className="flex flex-wrap h-auto gap-1">
        <TabsTrigger value="sections">Sections</TabsTrigger>
        <TabsTrigger value="category-groups">Category Groups</TabsTrigger>
        <TabsTrigger value="categories">Categories</TabsTrigger>
        <TabsTrigger value="brands">Brands</TabsTrigger>
        <TabsTrigger value="models">Models</TabsTrigger>
        <TabsTrigger value="attributes">Attributes</TabsTrigger>
        <TabsTrigger value="pool-categories">Pool Categories</TabsTrigger>
        <TabsTrigger value="coop-structure">Coop Structure</TabsTrigger>
        <TabsTrigger value="projections">Projections</TabsTrigger>
      </TabsList>

      <TabsContent value="sections"><MamSectionsTab /></TabsContent>
      <TabsContent value="category-groups"><MamCategoryGroupsTab /></TabsContent>
      <TabsContent value="categories"><MamCategoriesTab /></TabsContent>
      <TabsContent value="brands"><MamBrandsTab /></TabsContent>
      <TabsContent value="models"><MamModelsTab /></TabsContent>
      <TabsContent value="attributes"><MamCategoryAttributesTab /></TabsContent>
      <TabsContent value="pool-categories"><MamPoolCategoriesTab /></TabsContent>
      <TabsContent value="coop-structure"><MamCoopStructureTab /></TabsContent>
      <TabsContent value="projections"><MamProjectionAssumptionsTab /></TabsContent>
    </Tabs>
  </div>
);

export default MamAdmin;
